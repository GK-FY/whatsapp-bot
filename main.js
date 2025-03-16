// main.js

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Set the default command prefix to '.'
let prefix = '.';
// Record the bot's start time for uptime calculations
const botStartTime = Date.now();

// Spam tracking configuration: maximum 5 messages in a 10-second window per sender
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
 * Function: updateBio
 * -------------------
 * Hypothetically updates the bot's profile bio/status.
 * If no text is provided, it sets a default message with the current time.
 * Note: whatsapp-web.js might not support updating bio/status directly.
 */
function updateBio(newBio) {
    const bio = newBio || `Bot Active | Updated at ${new Date().toLocaleTimeString()}`;
    try {
        // Hypothetical function call—customize or remove if unsupported.
        client.setProfileStatus(bio);
        console.log(`Updated bio: ${bio}`);
    } catch (error) {
        console.error("Auto bio update failed (function may not be supported):", error);
    }
}

/**
 * Helper: formatUptime
 * --------------------
 * Converts a millisecond duration into a human-readable uptime string.
 */
function formatUptime(ms) {
    let seconds = Math.floor(ms / 1000);
    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);
    seconds %= 60;
    minutes %= 60;
    return `${hours}h ${minutes}m ${seconds}s`;
}

// Display QR code for authentication
client.on('qr', (qr) => {
    console.log('QR Code received. Please scan it with your WhatsApp app:');
    qrcode.generate(qr, { small: true });
});

// Once the client is ready, log the event and start auto-updating the bio every 59 seconds
client.on('ready', () => {
    console.log('Client is ready!');
    setInterval(() => updateBio(), 59 * 1000);
});

// Main message event handler
client.on('message_create', async (message) => {
    // Identify the sender (for group messages, message.author may be set)
    const sender = message.author || message.from;
    const now = Date.now();

    // ----------------------------
    // SPAM DETECTION
    // ----------------------------
    if (!spamTracker[sender]) {
        spamTracker[sender] = { count: 1, firstMsgTime: now };
    } else {
        const diff = now - spamTracker[sender].firstMsgTime;
        if (diff < spamInterval) {
            spamTracker[sender].count += 1;
        } else {
            // Reset the counter after the interval
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

    // ----------------------------
    // ANTI-LINK FEATURE
    // ----------------------------
    // If the message is from a group, does not start with the command prefix, and contains a link, then delete it.
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
                console.log(`Deleted link message from ${sender}`);
            } catch (error) {
                console.error("Error deleting link message:", error);
            }
            return;
        }
    }

    // ----------------------------
    // COMMAND HANDLING
    // ----------------------------
    // Process messages that start with the prefix.
    if (message.body.startsWith(prefix)) {
        const args = message.body.slice(prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

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
• \`.setbio [text]\` - Update bot bio/status. If no text is provided, it updates with the current time.
• \`.setprefix <newPrefix>\` - Change the command prefix (current: ${prefix}).
• \`.status\` - Display current bot status information.
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
            default:
                await message.reply("Unknown command. Type `.help` for a list of commands.");
        }
        return; // Stop further processing if a command was executed.
    }

    // ----------------------------
    // AUTO-GREETING RESPONSES
    // ----------------------------
    const lowerBody = message.body.toLowerCase();
    if (lowerBody.includes('hello') || lowerBody.includes('hi') || lowerBody.includes('hey')) {
        await message.reply('Hello there! How can I assist you today?');
    }
    // Additional message processing or features can be added here.
});

// Log authentication events
client.on('authenticated', () => {
    console.log('Client authenticated successfully.');
});
client.on('auth_failure', msg => {
    console.error('Authentication failure:', msg);
});

// Start the client
client.initialize();
