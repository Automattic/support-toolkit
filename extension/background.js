// Background service worker for API calls
// Handles AI requests from content scripts using Google Gemini API

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'AI_CHAT') {
        handleAIChat(request.message, request.history, request.apiKey)
            .then(response => sendResponse({ success: true, response }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep channel open for async response
    }

    // LINEAR AI SEARCH MESSAGE HANDLER
    // This handles the "Find Similar Issues" feature in the Linear panel.
    // When the user clicks the AI search button in linear-panel.js, that script
    // sends a message here with the ticket title and full conversation transcript.
    //
    // The background service worker (this file) then:
    // 1. Sends the transcript to Google Gemini AI to analyze
    // 2. AI extracts the core technical issue/feature name
    // 3. Returns search terms and summary back to the panel
    // 4. The panel then uses those terms to search Linear
    //
    // This architecture keeps the AI API call in the background worker (required
    // for Chrome Extension Manifest V3) instead of in the content script.
    if (request.type === 'AI_LINEAR_SEARCH') {
        handleLinearSearchQuery(request.title, request.transcript, request.apiKey)
            .then(response => sendResponse({ success: true, searchTerms: response }))
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

/**
 * Generate intelligent search query for Linear using AI
 *
 * This is the core function that powers the "Find Similar Issues" feature.
 * It takes a support conversation and uses Google Gemini AI to understand
 * the context and extract the specific feature or technical component being
 * discussed, then generates optimal search terms for Linear.
 *
 * WHY WE NEED THIS:
 * Simple keyword extraction fails because it treats all words equally.
 * For example, "user needs cookie consent and privacy policy for GDPR"
 * would extract: "cookie", "consent", "privacy", "policy", "GDPR"
 * But Linear searches better with: "Cookie Consent" (as a unit)
 *
 * AI understands that "Cookie Consent" is a feature name and should stay together.
 *
 * FALLBACK STRATEGY:
 * If no API key is configured or if the AI fails, we fall back to simple
 * keyword extraction. This ensures the feature still works (though not as well)
 * even without AI.
 *
 * @param {string} title - Zendesk ticket title
 * @param {string} transcript - Full conversation transcript with sender types
 * @param {string} apiKey - Google Gemini API key (optional, triggers fallback if missing)
 * @returns {Promise<Object>} Object with searchQuery and summary:
 *   - searchQuery: 2-3 word feature name (e.g., "Cookie Consent")
 *   - summary: Brief description of the issue
 */
async function handleLinearSearchQuery(title, transcript, apiKey = '') {
    console.log('[Background AI Linear] Starting search query generation');
    console.log('[Background AI Linear] Transcript length:', transcript.length);

    try {
        // FALLBACK: If no API key is configured, use simple keyword extraction
        // This provides degraded functionality but keeps the feature working
        if (!apiKey) {
            console.warn('[Background AI Linear] No API key, falling back to keyword extraction');
            const keywords = extractKeywords(transcript);
            return {
                searchQuery: keywords.slice(0, 4).join(' '),
                summary: generateSummary(transcript, keywords)
            };
        }

        // TRUNCATION: Limit transcript length to avoid API token limits
        // We keep the LAST 3000 characters because the most recent messages
        // usually contain the core issue being discussed. Earlier messages
        // are often greetings or resolved sub-issues.
        let truncatedTranscript = transcript;
        if (transcript.length > 3000) {
            console.log('[Background AI Linear] Truncating transcript to last 3000 chars');
            truncatedTranscript = transcript.slice(-3000);
        }

        // GEMINI 2.5 FLASH API
        // We use Gemini 2.5 Flash because:
        // 1. It's FREE (15 requests/min, 1500 requests/day)
        // 2. It has "thinking capability" - can reason about context
        // 3. It understands feature names vs random keywords
        //
        // IMPORTANT: v1beta API is required for Gemini 2.5 models
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        console.log('[Background AI Linear] Making request to Gemini 2.5 Flash...');

        // AI PROMPT ENGINEERING
        // This prompt is carefully crafted to extract FEATURE NAMES, not just keywords.
        // Key instructions:
        // 1. Keep multi-word features together ("Cookie Consent" not "cookie" + "consent")
        // 2. Ignore dates, URLs, generic words like "help", "user", "issue"
        // 3. Return 2-3 words MAX (Linear searches work better with focused terms)
        // 4. Return structured JSON (makes parsing reliable)
        //
        // Examples in the prompt teach the AI the pattern we want:
        // - "cookie banners" → "Cookie Consent" (feature name)
        // - "login problems" → "Login Authentication" (technical component)
        const prompt = `You are helping search Linear for existing issues. Read this support conversation and identify the EXACT PRODUCT FEATURE or TECHNICAL COMPONENT being discussed.

${truncatedTranscript}

INSTRUCTIONS:
1. Look for specific feature names mentioned (like "Cookie Consent Block", "Site Editor", "Jetpack", etc.)
2. If a feature has multiple words, keep them together (e.g., "Cookie Consent" not "cookie" and "consent")
3. Ignore generic terms like "help", "user", "issue", dates, URLs
4. Return 2-3 words MAX that describe the specific feature or component

EXAMPLES:
- User asking about cookie banners → "Cookie Consent"
- User discussing privacy policy → "Privacy Policy"
- User having login problems → "Login Authentication"
- User asking about Jetpack → "Jetpack"
- User editing templates → "Site Editor"

Return ONLY this exact format:
{"searchQuery":"Feature Name","summary":"what user needs help with"}

No markdown, no backticks, just the JSON.`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    // TEMPERATURE: Controls randomness (0.0 = deterministic, 1.0 = creative)
                    // We use 0.1 for consistent, focused results (not creative writing)
                    temperature: 0.1,

                    // MAX OUTPUT TOKENS: Critical setting!
                    // Gemini 2.5 Flash uses ~500 "thinking tokens" internally before responding
                    // If we set this too low (e.g., 500), the AI runs out of tokens mid-response
                    // and we get finishReason: "MAX_TOKENS" error.
                    // Setting to 1000 gives enough room for thinking + actual response.
                    maxOutputTokens: 1000,

                    // TOP-P: Nucleus sampling - only consider tokens with cumulative probability ≤ 0.8
                    // TOP-K: Only consider the top 10 most likely tokens at each step
                    // Together these make responses more focused and less random
                    topP: 0.8,
                    topK: 10
                }
            })
        });

        // ERROR HANDLING: If AI API fails, gracefully fall back to keyword extraction
        // Common errors:
        // - 400: Invalid API key
        // - 429: Rate limit exceeded (15 requests/min on free tier)
        // - 500: Server error
        //
        // Instead of showing an error to the user, we silently fall back to
        // simple keyword extraction so the search still works (just not as smart)
        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Background AI Linear] HTTP error:', response.status, errorText);

            // Graceful degradation: use keyword extraction as fallback
            const keywords = extractKeywords(transcript);
            return {
                searchQuery: keywords.slice(0, 3).join(' '),
                summary: 'AI unavailable - using keyword extraction'
            };
        }

        const data = await response.json();
        console.log('[Background AI Linear] API response:', JSON.stringify(data, null, 2));

        // PARSE AI RESPONSE
        // The AI should return JSON in this format:
        // {"searchQuery":"Feature Name","summary":"description"}
        //
        // We use optional chaining (?.) to safely navigate the response structure
        // because the API format could change or the response might be malformed
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
            const aiText = data.candidates[0].content.parts[0].text.trim();
            console.log('[Background AI Linear] AI response text:', aiText);

            // JSON PARSING with fallback strategy
            try {
                // Sometimes AI wraps JSON in markdown code blocks (```json\n...\n```)
                // We strip these out before parsing
                let jsonText = aiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                const result = JSON.parse(jsonText);

                return {
                    searchQuery: result.searchQuery || '',
                    summary: result.summary || ''
                };
            } catch (parseError) {
                console.error('[Background AI Linear] JSON parse error:', parseError);

                // REGEX FALLBACK: If JSON parsing fails, try to extract searchQuery with regex
                // This handles cases where the AI response is malformed but contains the data
                const match = aiText.match(/"searchQuery":\s*"([^"]+)"/);
                if (match) {
                    return {
                        searchQuery: match[1],
                        summary: 'Extracted from AI response'
                    };
                }
            }
        }

        // FINAL FALLBACK: If all parsing fails, use keyword extraction
        // This ensures the feature never completely breaks
        console.warn('[Background AI Linear] Falling back to keyword extraction');
        const keywords = extractKeywords(transcript);
        return {
            searchQuery: keywords.slice(0, 3).join(' '),
            summary: 'AI response incomplete - using keywords'
        };

    } catch (err) {
        console.error('[Background AI Linear] Error:', err);
        // Final fallback
        const keywords = extractKeywords(transcript);
        return {
            searchQuery: keywords.slice(0, 3).join(' '),
            summary: 'Error occurred - using keyword fallback'
        };
    }
}

/**
 * Extract technical keywords from transcript using frequency analysis
 *
 * This is a simple fallback method when AI is not available. It works by:
 * 1. Removing common "stopwords" (the, and, is, etc.)
 * 2. Counting how often each remaining word appears
 * 3. Returning the most frequent words
 *
 * LIMITATIONS:
 * - Treats each word separately (doesn't understand "Cookie Consent" as a unit)
 * - Can't distinguish between feature names and general discussion
 * - Often includes dates, URLs, and other irrelevant terms
 *
 * This is why AI-powered extraction is much better, but this provides
 * a reasonable fallback when AI is unavailable.
 *
 * @param {string} transcript - Full conversation transcript
 * @returns {string[]} Array of keywords sorted by frequency (most common first)
 */
function extractKeywords(transcript) {
    // STOPWORDS: Common English words that don't help with search
    // These are filtered out because they appear frequently but carry no meaning
    // (e.g., "the", "is", "user", "help")
    const stopwords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
        'from', 'up', 'about', 'into', 'through', 'during', 'is', 'are', 'was', 'were', 'be',
        'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
        'could', 'may', 'might', 'must', 'can', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
        'them', 'their', 'this', 'that', 'these', 'those', 'am', 'your', 'my', 'our',
        'user', 'customer', 'help', 'issue', 'problem', 'question', 'hi', 'hello', 'thanks',
        'thank', 'please', 'yes', 'no', 'okay', 'ok', 'bot', 'agent', 'end-user'
    ]);

    // WORD EXTRACTION
    // 1. Convert to lowercase for case-insensitive matching
    // 2. Remove punctuation EXCEPT hyphens (preserves "self-service", "e-commerce")
    // 3. Split on whitespace
    // 4. Filter out very short words (< 3 chars) like "at", "it", "to"
    const words = transcript.toLowerCase()
        .replace(/[^\w\s-]/g, ' ')  // Keep alphanumeric, spaces, and hyphens
        .split(/\s+/)
        .filter(word => word.length > 2);

    // FREQUENCY COUNTING
    // Build a map of word → count, excluding stopwords
    // The most frequently mentioned words are likely important
    const wordCount = {};
    for (const word of words) {
        if (!stopwords.has(word)) {
            wordCount[word] = (wordCount[word] || 0) + 1;
        }
    }

    // SORTING: Order by frequency (most common first)
    // We convert the object to array of [word, count] pairs, sort by count (descending),
    // then extract just the words
    const sortedWords = Object.entries(wordCount)
        .sort((a, b) => b[1] - a[1])  // b[1] - a[1] for descending order
        .map(([word]) => word);

    // Return top 10 keywords
    // Caller can decide how many to actually use (usually 3-4 for search)
    return sortedWords.slice(0, 10);
}

/**
 * Generate a human-readable summary from the transcript
 *
 * This function attempts to create a brief description of what the ticket is about
 * by extracting the most relevant user message from the conversation.
 *
 * STRATEGY:
 * 1. Find all messages from end-users (not agents or bots)
 * 2. Take the longest end-user message (usually the most detailed)
 * 3. Clean it up and truncate to 100 characters
 * 4. If no user messages found, generate generic summary from keywords
 *
 * This is used as a fallback when AI is unavailable, to show the user
 * what the search is about.
 *
 * @param {string} transcript - Full conversation transcript with sender types
 * @param {string[]} keywords - Extracted keywords (from extractKeywords function)
 * @returns {string} Brief summary (max 100 chars) describing the issue
 */
function generateSummary(transcript, keywords) {
    // Split transcript into individual lines and remove empty ones
    const lines = transcript.split('\n').filter(line => line.trim());

    // FIND USER MESSAGES
    // Look for lines that start with "end-user:" or contain "user ("
    // These are the customer's messages (not agent responses)
    const userMessages = lines.filter(line =>
        line.toLowerCase().includes('end-user:') ||
        line.toLowerCase().includes('user (')
    );

    if (userMessages.length > 0) {
        // EXTRACT LONGEST MESSAGE
        // The longest user message usually contains the most detail about the issue
        // Short messages are often just "hello" or "thanks"
        const mainMessage = userMessages.reduce((longest, current) =>
            current.length > longest.length ? current : longest
        );

        // CLEAN UP MESSAGE
        // 1. Remove the "end-user:" prefix
        // 2. Trim whitespace
        // 3. Truncate to 100 chars for display
        let summary = mainMessage
            .replace(/^.*?:/, '')  // Remove everything before the first colon
            .trim()
            .slice(0, 100);

        // Add ellipsis if truncated
        if (summary.length === 100) summary += '...';

        // Fallback if somehow the message is empty after cleaning
        return summary || 'Support ticket regarding ' + keywords.slice(0, 2).join(' and ');
    }

    // FALLBACK: No user messages found, use keywords
    // This happens rarely (e.g., ticket with only internal notes)
    return 'Issue related to ' + keywords.slice(0, 3).join(', ');
}

// Keep the old AI function in case we want to switch back
async function handleLinearSearchQueryWithAI(title, transcript, apiKey = '') {
    console.log('[Background AI Linear] Starting search query generation');
    console.log('[Background AI Linear] Transcript length:', transcript.length);

    try {
        if (!apiKey) {
            throw new Error('API key is required. Please add your Google Gemini API key in Settings.');
        }

        // Truncate very long transcripts to avoid token limits (keep last ~4000 chars)
        let truncatedTranscript = transcript;
        if (transcript.length > 4000) {
            console.log('[Background AI Linear] Transcript too long, truncating to last 4000 chars');
            truncatedTranscript = '...(earlier messages truncated)...\n\n' + transcript.slice(-4000);
        }

        // Using Google Gemini to analyze the ticket and generate search terms
        // Using 1.5-flash instead of 2.5-flash to avoid "thinking" token overhead
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        console.log('[Background AI Linear] Making request to Gemini...');

        const prompt = `You are analyzing a customer support conversation to find similar technical issues in Linear.

Read this support conversation and identify the MAIN TECHNICAL ISSUE or feature the user needs help with:

${truncatedTranscript}

Extract the core technical keywords and generate search terms for Linear. Focus on:
- Technical features mentioned (e.g., "cookie consent", "GDPR", "privacy policy", "site editor")
- Product/platform names (e.g., "WordPress", "WooCommerce", "Jetpack")
- Specific errors or problems
- NOT general words like "user", "help", "issue"

Return a JSON object with:
1. "searchQuery": 2-4 specific technical keywords from the conversation (e.g., "cookie consent GDPR" or "privacy policy template")
2. "summary": 1 sentence describing the technical issue

Example:
{
  "searchQuery": "cookie consent block privacy policy",
  "summary": "User needs to add cookie consent and privacy policy to their webshop for GDPR compliance"
}

Return ONLY the JSON object, no other text.`;

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
                    temperature: 0.3, // Lower temperature for more focused results
                    maxOutputTokens: 500 // Increased to allow full JSON response
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Background AI Linear] HTTP error:', response.status, errorText);

            if (response.status === 400) {
                throw new Error('Invalid API key. Please check your Google Gemini API key in Settings.');
            } else if (response.status === 429) {
                throw new Error('Rate limit exceeded. Please wait a moment and try again.');
            } else {
                throw new Error(`API error (${response.status}). Please try again.`);
            }
        }

        const data = await response.json();

        console.log('[Background AI Linear] Full API response:', JSON.stringify(data, null, 2));

        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
            const aiResponse = data.candidates[0].content.parts[0].text.trim();
            console.log('[Background AI Linear] AI text response:', aiResponse);

            // Try to parse JSON from the response
            try {
                // Remove markdown code blocks if present
                let jsonText = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                const result = JSON.parse(jsonText);

                return {
                    searchQuery: result.searchQuery || '',
                    summary: result.summary || ''
                };
            } catch (parseError) {
                console.error('[Background AI Linear] Failed to parse JSON:', parseError);
                console.error('[Background AI Linear] Raw AI response was:', aiResponse);
                // Fallback: extract meaningful keywords from the title
                const fallbackQuery = title.split(' ').slice(0, 4).join(' ');
                return {
                    searchQuery: fallbackQuery,
                    summary: 'AI analysis unavailable, using ticket title'
                };
            }
        } else {
            console.error('[Background AI Linear] Unexpected response structure:', JSON.stringify(data, null, 2));

            // Check if it was blocked by safety filters
            if (data.promptFeedback && data.promptFeedback.blockReason) {
                throw new Error(`Request blocked: ${data.promptFeedback.blockReason}. Try with a different ticket.`);
            }

            // Fallback to using title if response is unexpected
            const fallbackQuery = title.split(' ').slice(0, 4).join(' ');
            console.warn('[Background AI Linear] Using fallback query from title:', fallbackQuery);
            return {
                searchQuery: fallbackQuery,
                summary: 'AI response unavailable, using ticket title for search'
            };
        }

    } catch (err) {
        console.error('[Background AI Linear] Error:', err);
        throw err;
    }
}
