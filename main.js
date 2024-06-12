const HELP_MESSAGE = `
Usage: deno run --allow-net --allow-env main.js [--api-key YOUR_API_KEY] [--help]

Options:
  --api-key YOUR_API_KEY  Provide the OpenAI API key directly as a command-line argument.
  --help                  Display this help message.
`;

function printHelpAndExit() {
    console.log(HELP_MESSAGE);
    Deno.exit(0);
}

function parseArguments() {
    const args = Deno.args;
    let apiKey = Deno.env.get("CHATGPT_API_TOKEN");

    args.forEach((arg, index) => {
        if (arg === "--help") {
            printHelpAndExit();
        } else if (arg === "--api-key" && args[index + 1]) {
            apiKey = args[index + 1];
        }
    });

    if (!apiKey) {
        console.error("Error: CHATGPT_API_TOKEN environment.variable or --api-key argument must be provided.");
        Deno.exit(1);
    }

    return apiKey;
}

const apiKey = parseArguments();
const endpoint = 'https://api.openai.com/v1/chat/completions';
const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
};

let chatHistory = [{ "role": "system", "content": "You are a helpful assistant." }];

async function requestChatGPT(messages, onData) {
    const data = {
        model: 'gpt-4o',
        messages: messages,
        temperature: 0.7,
        max_tokens: 150,
        stream: true
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(data),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');

    let result = '';
    while(true) {
        const {done, value} = await reader.read();
        if (done) {
            break;
        }

        const chunk = decoder.decode(value, {stream: true});

        // Handle each chunk to extract the actual message content
        const jsonChunks = chunk.split('\n\n');

        for (const jsonChunk of jsonChunks) {
            if (jsonChunk.trim() === '' || jsonChunk.trim() === 'data: [DONE]') continue;

            try {
                const jsonResponse = JSON.parse(jsonChunk.replace('data: ', ''));
                const messageContent = jsonResponse.choices[0].delta?.content || '';

                result += messageContent;
                onData(messageContent);
            } catch (error) {
                if (!jsonChunk.includes('[DONE]')) {
                    console.error('Error parsing JSON chunk:', error);
                }
            }
        }
    }

    return result.trim();
}

async function repl() {
    console.log("Welcome to the ChatGPT REPL!");
    console.log("Type your query or 'exit' to quit:");

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    while (true) {
        const buffer = new Uint8Array(1024);
        await Deno.stdout.write(encoder.encode("> "));
        const n = await Deno.stdin.read(buffer);

        if (n === null) {
            console.log("\nGoodbye!");
            break;
        }

        const line = decoder.decode(buffer.subarray(0, n)).trim();

        if (line.toLowerCase() === "exit") {
            console.log("Goodbye!");
            break;
        }

        chatHistory.push({ role: 'user', content: line });

        const displayResponse = (chunk) => {
            Deno.stdout.write(new TextEncoder().encode(chunk));
        };

        const response = await requestChatGPT(chatHistory, displayResponse);

        // Ensure the response ends with a newline character
        if (!response.endsWith('\n')) {
          Deno.stdout.write(encoder.encode('\n'));
        }

        chatHistory.push({ role: 'assistant', content: response });
    }
}

repl();
