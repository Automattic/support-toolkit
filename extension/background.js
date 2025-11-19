// Background service worker for API calls
// Handles AI requests from content scripts using Google Gemini API

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'AI_CHAT') {
        handleAIChat(request.message, request.history, request.apiKey)
            .then(response => sendResponse({ success: true, response }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep channel open for async response
    }
});

async function handleAIChat(userMessage, chatHistory = [], apiKey = '') {
    try {
        if (!apiKey) {
            throw new Error('API key is required. Please add your Google Gemini API key in Settings.');
        }

        // Using Google Gemini 2.5 Flash (free tier: 60 requests/min)
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        // Build conversation context
        let prompt = 'You are a helpful AI assistant for customer support agents (Happiness Engineers). Help them with troubleshooting, drafting responses, and answering questions. Be concise and practical.\n\n';

        // Add chat history
        for (const msg of chatHistory) {
            if (msg.role === 'user') {
                prompt += `User: ${msg.content}\n`;
            } else if (msg.role === 'assistant') {
                prompt += `Assistant: ${msg.content}\n`;
            }
        }

        // Add current message
        prompt += `User: ${userMessage}\nAssistant:`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 500
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Background AI] HTTP error:', response.status, errorText);

            if (response.status === 400) {
                throw new Error('Invalid API key. Please check your Google Gemini API key in Settings.');
            } else if (response.status === 429) {
                throw new Error('Rate limit exceeded. Please wait a moment and try again.');
            } else {
                throw new Error(`API error (${response.status}). Please try again.`);
            }
        }

        const data = await response.json();

        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
            const aiResponse = data.candidates[0].content.parts[0].text.trim();
            return aiResponse;
        } else {
            console.error('[Background AI] Unexpected response:', data);
            throw new Error('Unexpected response from AI. Please try again.');
        }

    } catch (err) {
        console.error('[Background AI] Error:', err);
        throw err;
    }
}
