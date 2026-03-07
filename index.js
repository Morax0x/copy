const { Client, GatewayIntentBits, Collection, REST, Routes, Partials, Events } = require("discord.js");
const db = require('./database.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const aiConfig = require('./utils/aiConfig');
const { generateQuestAlert } = require('./generators/achievement-generator.js'); 
const { generateAchievementCard } = require('./generators/achievement-card-generator.js'); 
const { initGiveaways } = require('./handlers/giveaway-handler.js');
const { loadRoleSettings } = require('./handlers/reaction-role-handler.js');
const autoJoin = require('./handlers/auto-join.js'); 
const { startAuctionSystem } = require('./handlers/auction-handler.js');
const { startAutoChat } = require('./handlers/ai/auto-chat.js');

const MAIN_GUILD_ID = "952732360074494003"; 
const botToken = process.env.DISCORD_BOT_TOKEN;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages 
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction] 
});

client.commands = new Collection();
client.cooldowns = new Collection();
client.talkedRecently = new Map();
client.recentMessageTimestamps = new Collection(); 
client.antiRolesCache = new Map(); 

client.EMOJI_MORA = '<:mora:1435647151349698621>';
client.EMOJI_STAR = '⭐';
client.EMOJI_WI = '<a:wi:1435572304988868769>';
client.EMOJI_WII = '<a:wii:1435572329039007889>';
client.EMOJI_FASTER = '<a:JaFaster:1435572430042042409>';
client.EMOJI_PRAY = '<:0Pray:1437067281493524502>';
client.EMOJI_COOL = '<a:NekoCool:1435572459276337245>';

client.sql = db;
client.generateQuestAlert = generateQuestAlert;
client.generateAchievementCard = generateAchievementCard; 

try {
    const { registerFont } = require('canvas');
    const beinPath = path.join(__dirname, 'fonts', 'bein-ar-normal.ttf');
    if (fs.existsSync(beinPath)) registerFont(beinPath, { family: 'Bein' });
    else {
        const beinPathAlt = path.join(__dirname, 'fonts', 'Bein-Normal.ttf');
        if (fs.existsSync(beinPathAlt)) registerFont(beinPathAlt, { family: 'Bein' });
    }
    const emojiPath = path.join(__dirname, 'efonts', 'NotoEmoji.ttf');
    if (fs.existsSync(emojiPath)) registerFont(emojiPath, { family: 'NotoEmoji' });
} catch (e) {}

async function bootstrap() {
    try {
        console.log("⏳ Loading and checking database tables...");
        const dbSetupModule = require("./database-setup.js");
        const setupDatabase = dbSetupModule.setupDatabase || dbSetupModule;
        await setupDatabase(db); 

        if (aiConfig && typeof aiConfig.init === 'function') {
            await aiConfig.init(db); 
        }
        console.log("✅ Database and AI Config initialized successfully!");
    } catch (err) {
        console.error("!!! Database Setup Fatal Error !!!", err);
        process.exit(1);
    }

    require('./utils/db-manager.js')(client, db);
    require('./handlers/systems-manager.js')(client, db);
    try { require('./handlers/backup-scheduler.js')(client, db); } catch(e) {}

    const eventsPath = path.join(__dirname, 'events');
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) { 
        const filePath = path.join(eventsPath, file); 
        const event = require(filePath); 
        if (event.once) client.once(event.name, (...args) => event.execute(...args)); 
        else client.on(event.name, (...args) => event.execute(...args)); 
    }

    require('./interaction-handler.js')(client, db, client.antiRolesCache);

    client.once(Events.ClientReady, async () => { 
        console.log(`✅ Logged in as ${client.user.username}`);
          
        await autoJoin(client);
        await initGiveaways(client);
        require('./handlers/voice-timer.js')(client);
        startAuctionSystem(client); 
        startAutoChat(client);
        require('./handlers/weekly-role.js')(client);

        await loadRoleSettings(db, client.antiRolesCache);
        require('./handlers/cron-jobs.js')(client, db);

        const rest = new REST({ version: '10' }).setToken(botToken);
        const commands = [];
        const loadedCommandNames = new Set();

        function getFiles(dir) {
            const files = fs.readdirSync(dir, { withFileTypes: true });
            let commandFiles = [];
            for (const file of files) {
                if (file.isDirectory()) commandFiles = [...commandFiles, ...getFiles(path.join(dir, file.name))];
                else if (file.name.endsWith('.js')) commandFiles.push(path.join(dir, file.name));
            }
            return commandFiles;
        }

        const commandFiles = getFiles(path.join(__dirname, 'commands'));
        for (const file of commandFiles) {
            try {
                const command = require(file);
                const cmdName = command.data ? command.data.name : command.name;
                if (cmdName) {
                    if (loadedCommandNames.has(cmdName)) continue;
                    loadedCommandNames.add(cmdName);
                    if (command.data) commands.push(command.data.toJSON());
                    if ('execute' in command) client.commands.set(cmdName, command);
                }
            } catch (err) {}
        }
          
        try { 
            await rest.put(Routes.applicationGuildCommands(client.user.id, MAIN_GUILD_ID), { body: [] });
            await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
            console.log("✅ Slash commands registered successfully!");
        } catch (error) {
            console.error("❌ Failed to register slash commands:", error);
        }
    }); 

    try { require('./handlers/topgg-handler.js')(client, db); } catch (err) {}

    client.login(botToken);
}

bootstrap();

async function shutdownGracefully() {
    console.log("⚠️ Shutting down gracefully...");
    try {
        if (client) client.destroy();
        if (db) await db.end(); 
        process.exit(0);
    } catch (err) { process.exit(1); }
}

process.on('SIGINT', shutdownGracefully);
process.on('SIGTERM', shutdownGracefully);
