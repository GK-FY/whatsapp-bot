// main.js

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

// Set the default command prefix to '.'
let prefix = '.';
// Record the bot's start time for uptime calculations
const botStartTime = Date.now();

// Spam tracking: maximum 5 messages in a 10-second window per sender
const spamTracker = {};
const spamThreshold = 5;
const spamInterval = 10 * 1000; // 10 seconds

// Create a new client instance with LocalAuth for session persistence
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true, // run headless for performance
        args: ['--no-sandbox']
    }
});

/**
 * updateBio: Hypothetically updates the bot's profile bio/status.
 * (Replace or remove this if your API does not support updating status.)
 */
function updateBio(newBio) {
    const bio = newBio || `Bot Active | Updated at ${new Date().toLocaleTimeString()}`;
    try {
        // Hypothetical function call—customize if an API becomes available.
        client.setProfileStatus(bio);
        console.log(`Updated bio: ${bio}`);
    } catch (error) {
        console.error("Auto bio update failed (function may not be supported):", error);
    }
}

/**
 * formatUptime: Converts a millisecond duration into a human-readable string.
 */
function formatUptime(ms) {
    let seconds = Math.floor(ms / 1000);
    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);
    seconds %= 60;
    minutes %= 60;
    return `${hours}h ${minutes}m ${seconds}s`;
}

/**
 * logCommand: Append command usage details to a log file.
 */
function logCommand(command, sender) {
    const logLine = `${new Date().toISOString()} - ${sender} - ${command}\n`;
    fs.appendFile('command.log', logLine, (err) => {
        if (err) console.error("Error logging command:", err);
    });
}

// ---------------------------
// QR Code and Authentication
// ---------------------------
client.on('qr', (qr) => {
    console.log('QR Code received. Please scan it with your WhatsApp app:');
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    console.log('Client authenticated successfully.');
});

client.on('auth_failure', msg => {
    console.error('Authentication failure:', msg);
});

// ---------------------------
// Ready event: Start auto bio update
// ---------------------------
client.on('ready', () => {
    console.log('Client is ready!');
    setInterval(() => updateBio(), 59 * 1000);
});

// ---------------------------
// Group Events: Welcome and Farewell Messages
// ---------------------------

// When a new participant joins the group
client.on('group_join', async (notification) => {
    try {
        const chat = await notification.getChat();
        const newParticipant = notification.id.participant;
        await chat.sendMessage(`Welcome @${newParticipant.split('@')[0]} to ${chat.name}!`, { mentions: [newParticipant] });
        console.log(`Welcomed new participant: ${newParticipant}`);
    } catch (error) {
        console.error("Error welcoming new participant:", error);
    }
});

// When a participant leaves the group
client.on('group_leave', async (notification) => {
    try {
        const chat = await notification.getChat();
        const leavingParticipant = notification.id.participant;
        await chat.sendMessage(`Goodbye @${leavingParticipant.split('@')[0]}, we'll miss you!`, { mentions: [leavingParticipant] });
        console.log(`Acknowledged departure of: ${leavingParticipant}`);
    } catch (error) {
        console.error("Error sending farewell message:", error);
    }
});

// ---------------------------
// Message Handler: Process incoming messages and commands
// ---------------------------
client.on('message_create', async (message) => {
    // Identify the sender (group messages may have an author)
    const sender = message.author || message.from;
    const now = Date.now();

    // ---- Spam Detection ----
    if (!spamTracker[sender]) {
        spamTracker[sender] = { count: 1, firstMsgTime: now };
    } else {
        const diff = now - spamTracker[sender].firstMsgTime;
        if (diff < spamInterval) {
            spamTracker[sender].count += 1;
        } else {
            // Reset counter after the interval
            spamTracker[sender] = { count: 1, firstMsgTime: now };
        }
    }
    if (spamTracker[sender].count > spamThreshold) {
        try {
            if (message.from.includes('@g.us')) {
                await message.delete(true);
                await client.sendMessage(
                    message.from,
                    `@${sender} Please stop spamming!`,
                    { mentions: [sender] }
                );
            } else {
                await message.reply("You're sending messages too quickly. Please slow down.");
            }
        } catch (error) {
            console.error("Error handling spam:", error);
        }
        return;
    }

    // ---- Anti-Link Filtering ----
    // For group chats: if message is not a command and contains a URL, delete it.
    if (!message.body.startsWith(prefix) && message.from.includes('@g.us')) {
        const linkRegex = /(https?:\/\/[^\s]+)/gi;
        if (linkRegex.test(message.body)) {
            try {
                await message.delete(true);
                await client.sendMessage(
                    message.from,
                    `@${sender} Links are not allowed in this group!`,
                    { mentions: [sender] }
                );
                console.log(`Deleted a link message from ${sender}`);
            } catch (error) {
                console.error("Error deleting link message:", error);
            }
            return;
        }
    }

    // ---- Command Handling ----
    if (message.body.startsWith(prefix)) {
        const args = message.body.slice(prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        // Log the command usage
        logCommand(command, sender);

        switch (command) {
            case 'ping':
                await message.reply('pong');
                break;
            case 'help':
                {
                    const helpText = `*Bot Commands:*
• \`.ping\` - Check bot responsiveness.
• \`.help\` - Show this help message.
• \`.say <message>\` - Echo the message.
• \`.roll\` - Roll a random number between 1 and 100.
• \`.uptime\` - Show how long the bot has been running.
• \`.setbio [text]\` - Update bot bio/status.
• \`.setprefix <newPrefix>\` - Change the command prefix (current: ${prefix}).
• \`.groupinfo\` - Get information about the current group.
• \`.calc <expression>\` - Evaluate a mathematical expression.
• \`.weather <city>\` - Get a dummy weather forecast.
• \`.quote\` - Receive a random inspirational quote.
• \`.fact\` - Get a random fact.
• \`.kick @user\` - Kick a mentioned user from the group.
`;
                    await message.reply(helpText);
                }
                break;
            case 'say':
                if (args.length > 0) {
                    const sayMessage = args.join(' ');
                    await message.reply(sayMessage);
                } else {
                    await message.reply("You didn't provide any message to echo!");
                }
                break;
            case 'roll':
                {
                    const randomNum = Math.floor(Math.random() * 100) + 1;
                    await message.reply(`You rolled: ${randomNum}`);
                }
                break;
            case 'uptime':
                {
                    const uptime = formatUptime(Date.now() - botStartTime);
                    await message.reply(`Bot has been running for: ${uptime}`);
                }
                break;
            case 'setbio':
                {
                    const newBio = args.join(' ');
                    if (newBio) {
                        updateBio(newBio);
                        await message.reply(`Bio updated to: ${newBio}`);
                    } else {
                        updateBio();
                        await message.reply("Bio auto-updated with current time.");
                    }
                }
                break;
            case 'setprefix':
                {
                    if (args.length === 1) {
                        prefix = args[0];
                        await message.reply(`Command prefix updated to: ${prefix}`);
                    } else {
                        await message.reply("Usage: .setprefix <newPrefix>");
                    }
                }
                break;
            case 'status':
                {
                    const uptime = formatUptime(Date.now() - botStartTime);
                    const currentTime = new Date().toLocaleTimeString();
                    const statusMessage = `*Bot Status:*
• Uptime: ${uptime}
• Current Time: ${currentTime}
• Command Prefix: ${prefix}
`;
                    await message.reply(statusMessage);
                }
                break;
            case 'groupinfo':
                {
                    if (!message.from.includes('@g.us')) {
                        await message.reply("This command can only be used in groups.");
                        break;
                    }
                    const chat = await message.getChat();
                    const info = `*Group Info:*
Subject: ${chat.name}
Participants: ${chat.participants.length}
Description: ${chat.description || "No description provided."}`;
                    await message.reply(info);
                }
                break;
            case 'calc':
                {
                    if (args.length === 0) {
                        await message.reply("Usage: .calc <expression>");
                        break;
                    }
                    const expression = args.join(' ');
                    try {
                        // WARNING: Using eval() can be dangerous.
                        const result = eval(expression);
                        await message.reply(`Result: ${result}`);
                    } catch (error) {
                        await message.reply("Invalid expression.");
                    }
                }
                break;
            case 'weather':
                {
                    if (args.length === 0) {
                        await message.reply("Usage: .weather <city>");
                        break;
                    }
                    const city = args.join(' ');
                    // Simulated weather forecast
                    const temp = Math.floor(Math.random() * 30) + 10;
                    const weather = `The current temperature in ${city} is ${temp}°C with clear skies.`;
                    await message.reply(weather);
                }
                break;
            case 'quote':
                {
                    const quotes = [
                        "Believe you can and you're halfway there.",
                        "Your limitation—it's only your imagination.",
                        "Push yourself, because no one else is going to do it for you.",
                        "Great things never come from comfort zones.",
                        "Dream it. Wish it. Do it."
                    ];
                    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
                    await message.reply(randomQuote);
                }
                break;
            case 'fact':
                {
                    const facts = [
                        "Honey never spoils.",
                        "A single strand of spaghetti is called a spaghetto.",
                        "Octopuses have three hearts.",
                        "Bananas are berries, but strawberries aren't.",
                        "The Eiffel Tower can be 15 cm taller during hot days."
                    ];
                    const randomFact = facts[Math.floor(Math.random() * facts.length)];
                    await message.reply(randomFact);
                }
                break;
            case 'kick':
                {
                    if (!message.from.includes('@g.us')) {
                        await message.reply("This command can only be used in groups.");
                        break;
                    }
                    if (!message.mentionedIds || message.mentionedIds.length === 0) {
                        await message.reply("Please mention a user to kick.");
                        break;
                    }
                    const chat = await message.getChat();
                    for (const id of message.mentionedIds) {
                        try {
                            await chat.removeParticipants([id]);
                            await message.reply(`User @${id.split('@')[0]} has been kicked from the group.`);
                        } catch (error) {
                            console.error("Error kicking user:", error);
                            await message.reply(`Failed to kick @${id.split('@')[0]}.`);
                        }
                    }
                }
                break;
            default:
                await message.reply("Unknown command. Type `.help` for a list of commands.");
        }
        return; // End processing after executing a command.
    }

    // ---- Auto Greeting for Non-Command Messages ----
    const lowerBody = message.body.toLowerCase();
    if (lowerBody.includes('hello') || lowerBody.includes('hi') || lowerBody.includes('hey')) {
        await message.reply('Hello there! How can I help you today?');
    }
});

// ---------------------------
// Initialize the Client
// ---------------------------
client.initialize();
