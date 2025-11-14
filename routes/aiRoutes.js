import express from 'express';
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();
const router = express.Router();


// Test route to verify aiRoutes is working
router.get('/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'AI routes are working!',
    endpoint: '/api/ai/format-prompt'
  });
});



// POST /api/ai/generate - Generate AI response using Groq
router.post('/generate', async (req, res) => {
  try {
    const { prompt, model = 'llama-3.1-8b-instant', max_tokens = 1024 } = req.body;

    // Validate input
    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
    }

    // Call Groq API
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PROMPT_GROQ_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: max_tokens,
        temperature: 0.7,
        top_p: 0.9,
      }),
    });

    if (!groqResponse.ok) {
      const errorData = await groqResponse.json();
      throw new Error(errorData.error?.message || `Groq API error: ${groqResponse.status}`);
    }

    const data = await groqResponse.json();
    
    const generatedText = data.choices[0]?.message?.content;

    if (!generatedText) {
      throw new Error('No response generated from AI');
    }

    // Return success response
    res.json({
      success: true,
      generatedText: generatedText,
      usage: data.usage,
      model: data.model
    });

  } catch (error) {
    console.error('Groq API Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate AI response'
    });
  }
});

// POST /api/ai/format-prompt - Format prompt using AI
router.post('/format-prompt', async (req, res) => {
  try {
    const { prompt, instruction } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
    }

    const formattingInstruction = instruction || 
      "Format this prompt to follow industry best practices. Improve clarity, structure, and effectiveness while maintaining the original intent. Make it more professional and well-structured.";

    const systemPrompt = `You are a prompt engineering expert. Format the given prompt according to these rules:
1. Improve clarity and readability
2. Maintain the original intent and purpose
3. Use proper structure and formatting
4. Make it more effective for AI models
5. Keep it concise but comprehensive
6. Give a suggestion for improvement

Return only the formatted prompt without any additional explanations.`;

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PROMPT_GROQ_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Original prompt: ${prompt}\n\nInstruction: ${formattingInstruction}` }
        ],
        max_tokens: 2048,
        temperature: 0.3, // Lower temperature for more consistent formatting
      }),
    });

    if (!groqResponse.ok) {
      const errorData = await groqResponse.json();
      throw new Error(errorData.error?.message || `Groq API error: ${groqResponse.status}`);
    }

    const data = await groqResponse.json();
    const formattedPrompt = data.choices[0]?.message?.content;

    if (!formattedPrompt) {
      throw new Error('No formatted prompt generated');
    }

    res.json({
      success: true,
      formattedPrompt: formattedPrompt.trim(),
      usage: data.usage,
      model: data.model
    });

  } catch (error) {
    console.error('Prompt Formatting Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to format prompt'
    });
  }
});

export default router;