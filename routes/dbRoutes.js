import express from 'express';
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();
const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

router.get('/getPrompts', async (req, res) => {
  try {
    // Step 1: Get all active prompts
    const { data: prompts, error: promptsError } = await supabase
      .from("prompt_master")
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (promptsError) {
      console.error('Error fetching prompts:', promptsError);
      return res.status(500).json({ error: promptsError.message });
    }

    // Step 2: Get active versions for these prompts
    const activeVersionIds = prompts
      .map(p => p.active_version_id)
      .filter(id => id !== null); // Only get versions that exist

    let versions = [];
    if (activeVersionIds.length > 0) {
      const { data: versionsData, error: versionsError } = await supabase
        .from("prompt_versions")
        .select('*')
        .in('version_id', activeVersionIds);

      if (versionsError) {
        console.error('❌ Error fetching versions:', versionsError);
        return res.status(500).json({ error: versionsError.message });
      }
      versions = versionsData;
    }

    // Step 3: Combine the data
    const combinedData = prompts.map(prompt => {
      const activeVersion = versions.find(v => v.version_id === prompt.active_version_id);
      
      return {
        prompt_id: prompt.prompt_id,
        title: prompt.title,
        description: prompt.description,
        created_at: prompt.created_at,
        updated_at: prompt.updated_at,
        active_version_id: prompt.active_version_id,
        // Version data if available
        version_id: activeVersion?.version_id || null,
        version_number: activeVersion?.version_number || null,
        prompt_text: activeVersion?.prompt_text || null,
        metadata: activeVersion?.metadata || null,
        created_by: activeVersion?.created_by || null,
        version_created_at: activeVersion?.created_at || null
      };
    });

    //console.log('COMBINED DATA:', combinedData);
    res.json(combinedData);

  } catch (error) {
    console.error('Error fetching prompts:', error);
    res.status(500).json({ error: 'Failed to fetch prompts' });
  }
});


// GET /api/db/getPromptVersions/:prompt_id
router.get('/getPromptVersions/:prompt_id', async (req, res) => {
  try {
    const { prompt_id } = req.params;
    
    const { data, error } = await supabase
      .from('prompt_versions')
      .select('*')
      .eq('prompt_id', prompt_id)
      .order('version_number', { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error fetching versions:', error);
    res.status(500).json({ error: error.message });
  }
});


// PUT /api/db/setActiveVersion
router.put('/setActiveVersion', async (req, res) => {
  try {
    const { prompt_id, version_id } = req.body;

    const { data, error } = await supabase
      .from('prompt_master')
      .update({
        active_version_id: version_id,
        updated_at: new Date().toISOString().replace('Z', '+00:00')
      })
      .eq('prompt_id', prompt_id)
      .select();

    if (error) throw error;

    res.json({ message: 'Active version updated successfully', prompt: data[0] });
  } catch (error) {
    console.error('Error setting active version:', error);
    res.status(500).json({ error: error.message });
  }
});


// PUT /api/db/updatePrompt/:prompt_id - Create new version and update active_version_id
router.put('/updatePrompt/:prompt_id', async (req, res) => {
  try {
    const { prompt_id } = req.params;
    const { prompt_text, title, description, created_by, metadata } = req.body;

    console.log('Creating new version for prompt:', prompt_id);

    // Step 1: Get current version number
    const { data: currentVersion, error: versionError } = await supabase
      .from("prompt_versions")
      .select("version_number")
      .eq("prompt_id", prompt_id)
      .order("version_number", { ascending: false })
      .limit(1);

    if (versionError) throw versionError;

    const nextVersion = currentVersion.length > 0 ? currentVersion[0].version_number + 1 : 1;
	console.log('Next version is :', nextVersion);

    // Step 2: Create new version in prompt_versions
    const { data: newVersion, error: createError } = await supabase
      .from("prompt_versions")
      .insert([
        {
          prompt_id: prompt_id,
          version_number: nextVersion,
          prompt_text: prompt_text,
          metadata: metadata || {},
          created_by: created_by || 'system',
          is_published: true
        }
      ])
      .select();

    if (createError) throw createError;

    const newVersionId = newVersion[0].version_id;
	console.log('New versionID is :', newVersionId);

    // Step 3: Update Prompt_Master with new active_version_id
    const { data: updatedPrompt, error: updateError } = await supabase
      .from("prompt_master")
      .update({
        active_version_id: newVersionId,
        updated_at: new Date().toISOString().replace('Z', '+00:00')
      })
      .eq("prompt_id", prompt_id)
      .select();

    if (updateError) throw updateError;

    //console.log('New version created successfully:', { prompt_id, version: nextVersion });
	//console.log('New version created successfully:', updatedPrompt[0], updatedPrompt[0].active_version_id[0]);

    res.json({
      message: 'New version created successfully',
      prompt: {
        ...updatedPrompt[0],
        ...updatedPrompt[0].active_version_id[0]
      }
    });

  } catch (error) {
    console.error('Error creating new version:', error);
    res.status(500).json({ error: error.message });
  }
});


// POST /api/db/saveNewPrompt - Save a new prompt with versioning
router.post('/saveNewPrompt', async (req, res) => {
  let promptId = null;
  let versionId = null;

  try {
    const { title, content, description, created_by, metadata, category } = req.body;

    console.log('Saving new prompt with versioning:', { title, content, description, category });

    // Validate required fields
    if (!title || !content) {
      return res.status(400).json({ 
        error: 'Title and content are required fields' 
      });
    }

    // Generate unique IDs
    promptId = generatePromptId(title);
    const createdAt = new Date().toISOString().replace('Z', '+00:00');

    // Step 1: Create the main prompt record in prompt_master first
    const { data: promptData, error: promptError } = await supabase
      .from("prompt_master")
      .insert([
        { 
          prompt_id: promptId,
		  category: category,
          title: title,
          description: description || null,
          parent_id: null, // This is the first version, so no parent
          created_at: createdAt,
          updated_at: createdAt,
          active_version_id: null, // Will update this after creating version
          is_active: true
        }
      ])
      .select();

    if (promptError) {
      console.error('Error creating prompt master:', promptError);
      return res.status(500).json({ error: promptError.message });
    }

    // Step 2: Create the first version in prompt_versions
    const { data: versionData, error: versionError } = await supabase
      .from("prompt_versions")
      .insert([
        { 
          prompt_id: promptId,
          version_number: 1,
          prompt_text: content,
          metadata: metadata || {},
          created_by: created_by || 'system',
          is_published: true
        }
      ])
      .select();

    if (versionError) {
      console.error('Error creating prompt version:', versionError);
      
      // If version creation fails, delete the prompt master record we just created
      await supabase
        .from("prompt_master")
        .delete()
        .eq('prompt_id', promptId);
      
      return res.status(500).json({ error: versionError.message });
    }

    versionId = versionData[0].version_id;

    // Step 3: Update prompt_master with the active_version_id
    const { error: updateError } = await supabase
      .from("prompt_master")
      .update({ 
        active_version_id: versionId,
        updated_at: createdAt
      })
      .eq('prompt_id', promptId);

    if (updateError) {
      console.error('Error updating prompt master with version ID:', updateError);
      
      // Cleanup both records if update fails
      await supabase
        .from("prompt_versions")
        .delete()
        .eq('version_id', versionId);
      
      await supabase
        .from("prompt_master")
        .delete()
        .eq('prompt_id', promptId);
      
      return res.status(500).json({ error: updateError.message });
    }

    //console.log('New prompt saved successfully. Prompt ID:', promptId, 'Version ID:', versionId);
    
    // Get the final combined data
    const { data: finalPromptData, error: finalError } = await supabase
      .from("prompt_master")
      .select(`
        *,
        prompt_versions (*)
      `)
      .eq('prompt_id', promptId)
      .single();

    if (finalError) {
      console.error('Error fetching final prompt data:', finalError);
    }

    res.status(201).json({ 
      message: 'Prompt saved successfully',
      prompt: finalPromptData || {
        ...promptData[0],
        active_version_id: versionId,
        prompt_versions: versionData
      }
    });

  } catch (error) {
    console.error('Error saving new prompt:', error);
    
    // Comprehensive cleanup in case of unexpected errors
    if (versionId) {
      await supabase
        .from("prompt_versions")
        .delete()
        .eq('version_id', versionId);
    }
    
    if (promptId) {
      await supabase
        .from("prompt_master")
        .delete()
        .eq('prompt_id', promptId);
    }
    
    res.status(500).json({ error: error.message });
  }
});

function generatePromptId(title) {
  if (!title || typeof title !== 'string') {
    // Fallback if no title provided
    return `PROMPT_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  // Convert to uppercase and replace spaces with underscores
  let baseId = title
    .toUpperCase()
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/[^A-Z0-9_]/g, '') // Remove special characters, keep only A-Z, 0-9, _
    .replace(/_+/g, '_') // Replace multiple underscores with single
    .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores

  // If after cleaning the ID is empty, use fallback
  if (!baseId) {
    return `PROMPT_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  // Generate timestamp in YYYYMMDD_HHMMSS format
  const now = new Date();
  const timestamp = 
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') + '_' +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');

  // Generate random string (6 characters)
  const randomStr = Math.random().toString(36).substr(2, 6).toUpperCase();

  // Combine: baseId_timestamp_random
  const uniqueId = `${baseId}_${timestamp}_${randomStr}`;

  // Limit total length to avoid too long IDs
  if (uniqueId.length > 100) {
    // If too long, truncate baseId but keep timestamp and random
    const maxBaseLength = 100 - timestamp.length - randomStr.length - 2; // -2 for underscores
    const truncatedBase = baseId.substring(0, Math.max(10, maxBaseLength)); // Keep at least 10 chars
    return `${truncatedBase}_${timestamp}_${randomStr}`;
  }
  return uniqueId;
}
export default router;
