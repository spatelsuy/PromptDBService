import express from 'express';
import cors from "cors";
import dotenv from "dotenv";
import OAuth2Client from "google-auth-library";

dotenv.config();
const router = express.Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Test route to verify aiRoutes is working
router.get('/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'AI routes are working!',
    endpoint: '/api/ai/format-prompt'
  });
});

router.post("/saveSettings", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Missing Authorization header" });
    }

    const idToken = authHeader.split(" ")[1];
    if (!idToken) {
      return res.status(401).json({ error: "Invalid Authorization header format" });
    }

    // Verify Google ID Token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const userId = payload.sub; // Google unique user ID

    // Validate request body
    const { apiUrl } = req.body;
    if (!apiUrl) {
      return res.status(400).json({ error: "apiUrl is required" });
    }

    // TODO — Save API URL for this user in your database  
    // Example (you implement saveApiUrlForUser)
    return res.json({ success: true, message: "API URL saved successfully" });
  } catch (err) {
    console.error("Error saving settings:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
});

// POST /api/ai/test-with-multiple-providers - Real implementation starting with Groq
router.post('/test-with-multiple-providers', async (req, res) => {
  try {
    const { prompt, providers } = req.body;
	
    if (!prompt || !providers || !Array.isArray(providers)) {
      return res.status(400).json({
        success: false,
        error: 'Prompt and providers array are required'
      });
    }

    // Get provider details from database
    const providerResponse = await fetch('https://promptdbservice.onrender.com/api/db/getSelectedProviders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        providerIds: providers
      }),
    });
	
    if (!providerResponse.ok) {
      throw new Error('Failed to fetch provider details from database');
    }

    const providerData = await providerResponse.json();
    
    if (!providerData.success) {
      throw new Error(providerData.error || 'Failed to get provider details');
    }

    const providerDetails = providerData.providers;	

    if (!providerDetails || providerDetails.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No active providers found'
      });
    }

    const results = [];
    
    // Test with each selected provider
    for (const provider of providerDetails) {
      try {
        let result;
        
        // Start with Groq implementation
        if (provider.id === 'groq') {
          result = await callGroqAPI(provider, prompt);
        } else if (provider.id === 'huggingface') {
			result = await callHuggingFaceChat(prompt);
		} else if (provider.id === 'deepseek') {
		  result = await callDeepSeekAPI(provider, prompt);
		} else if (provider.id === 'openrouter-claude') {
		  result = await callOpenRouterAPI(provider, prompt);
		} else if (provider.id === 'openrouter-gemini') {
		  result = await callOpenRouterAPI(provider, prompt);
		}
		else {
          // For other providers, return mock for now
          result = {
            response: `Mock response from ${provider.name} for: ${prompt.substring(0, 50)}...`,
            usage: { total_tokens: 100 }
          };
        }
        
        results.push({
          provider: provider.id,
          providerName: provider.name,
          model: provider.model,
          response: result.response,
          usage: result.usage,
          success: true
        });
      } catch (error) {
        console.error(`Error with provider ${provider.id}:`, error);
        results.push({
          provider: provider.id,
          providerName: provider.name,
          model: provider.model,
          response: `Error: ${error.message}`,
          success: false
        });
      }
    }

    res.json({
      success: true,
      results: results
    });

  } catch (error) {
    console.error('Multi-provider test error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Groq API implementation
async function callGroqAPI(provider, prompt) {
  try {
    const apiKey = process.env.PROMPT_GROQ_KEY;
    
    if (!apiKey) {
      throw new Error('PROMPT_GROQ_KEY not found in environment variables');
    }

    const requestBody = {
      model: provider.model, // 'llama-3.1-8b-instant'
      messages: [{ role: 'user', content: prompt }],
      max_tokens: provider.max_tokens || 1024,
      temperature: provider.temperature || 0.7, 
	  top_p: 0.9,
    };

    console.log('Calling Groq API with:', {
      model: provider.model,
      endpoint: provider.endpoint,
      max_tokens: requestBody.max_tokens
    });

    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`Groq API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Groq API response received');

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response format from Groq API');
    }

    return {
      response: data.choices[0].message.content,
      usage: data.usage
    };

  } catch (error) {
    console.error('Groq API call failed:', error);
    throw error;
  }
}



// OpenRouter API implementation
async function callOpenRouterAPI(provider, prompt) {
  try {
    const apiKey = process.env.PROMPT_OPENRUNNER_KEY;
    
    if (!apiKey) {
      throw new Error('PROMPT_OPENRUNNER_KEY not found in environment variables');
    }

    const requestBody = {
      model: provider.model, // e.g., 'google/gemini-flash-1.5'
      messages: [
        { 
          role: 'user', 
          content: prompt 
        }
      ],
      max_tokens: provider.max_tokens || 1024,
      temperature: provider.temperature || 0.7
    };

    console.log('Calling OpenRouter API with:', {
      model: provider.model,
      endpoint: provider.endpoint
    });

    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://your-app.com', // Required by OpenRouter
        'X-Title': 'Prompt Testing App' // Required by OpenRouter
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('OpenRouter API response received');

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response format from OpenRouter API');
    }

    return {
      response: data.choices[0].message.content,
      usage: data.usage
    };

  } catch (error) {
    console.error('OpenRouter API call failed:', error);
    throw error;
  }
}

async function callHuggingFaceChat(prompt) {
  const apiKey = process.env.PROMPT_HUGGINGFACE_KEY;
  if (!apiKey) {
    throw new Error("Set HF_API_KEY environment variable");
  }

  const MODEL = "google/gemma-2-2b";
  const endpoint = `https://router.huggingface.co/hf-inference/models/${MODEL}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        max_new_tokens: 200,
        temperature: 0.7
      }
    })
  });

  const data = await response.json();
  console.log("Raw HF Response:", data);

  // Format text depending on HF structure
  if (Array.isArray(data) && data[0]?.generated_text) {
    console.log("\nGenerated:", data[0].generated_text);
  } else {
    console.log("\nUnexpected response format:", data);
  }
}



// Hugging Face API implementation
async function callHuggingFaceAPI(provider, prompt) {
  try {
    const apiKey = process.env.PROMPT_HUGGINGFACE_KEY;
    
    if (!apiKey) {
      throw new Error('PROMPT_HUGGINGFACE_KEY not found in environment variables');
    }

    console.log('Calling Hugging Face API with:', {
      model: provider.model,
      endpoint: provider.endpoint
    });

    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: prompt,
		model: provider.model,  // Model goes in the request body
        parameters: {
          max_new_tokens: provider.max_tokens || 512,
          temperature: provider.temperature || 0.7,
          return_full_text: false
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Hugging Face API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`Hugging Face API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Hugging Face API response received:', data);

    // Hugging Face returns different response format
    if (Array.isArray(data) && data[0] && data[0].generated_text) {
      return {
        response: data[0].generated_text,
        usage: { total_tokens: data[0].generated_text.length / 4 } // Rough estimate
      };
    } else if (data.generated_text) {
      return {
        response: data.generated_text,
        usage: { total_tokens: data.generated_text.length / 4 }
      };
    } else {
      throw new Error('Invalid response format from Hugging Face API');
    }

  } catch (error) {
    console.error('Hugging Face API call failed:', error);
    throw error;
  }
}


// DeepSeek API implementation
async function callDeepSeekAPI(provider, prompt) {
  try {
    const apiKey = process.env.PROMPT_DEEPSEEK_KEY;
    
    if (!apiKey) {
      throw new Error('PROMPT_DEEPSEEK_KEY not found in environment variables');
    }

    const requestBody = {
      model: provider.model, // 'deepseek-chat'
      messages: [{role: 'user', content: prompt}],
      max_tokens: provider.max_tokens || 2048,
      temperature: provider.temperature || 0.7,
      stream: false
    };

    console.log('Calling DeepSeek API with:', {
      model: provider.model,
      endpoint: provider.endpoint,
      max_tokens: requestBody.max_tokens
    });

    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('DeepSeek API response received');

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response format from DeepSeek API');
    }

    return {
      response: data.choices[0].message.content,
      usage: data.usage
    };

  } catch (error) {
    console.error('DeepSeek API call failed:', error);
    throw error;
  }
}



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



