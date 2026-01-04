const { SlashCommandBuilder } = require("discord.js");
const { startDungeon } = require("../../handlers/dungeon-handler.js");

const OWNER_ID = "1145327691772481577"; 
const COOLDOWN_TIME = 3 * 60 * 60 * 1000; 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dungeon')
        .setDescription('⚔️ ادخل الدانجون وحارب الوحوش !')
        .setDMPermission(false),

    name: 'dungeon',
    aliases: ['دانجون', 'برج', 'dgn'],
    category: "Economy",
    description: "نظام الدانجون المتقدم (PvE)",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction;

        if (isSlash) {
            interaction = interactionOrMessage;
        } else {
            const message = interactionOrMessage;
            interaction = {
                user: message.author,
                guild: message.guild,
                member: message.member,
                channel: message.channel,
                client: message.client,
                id: message.id,
                isChatInputCommand: false,
                reply: async (payload) => message.reply(payload),
                editReply: async (payload) => {
                    if (message.lastBotReply) return message.lastBotReply.edit(payload);
                    return message.channel.send(payload); 
                },
                followUp: async (payload) => message.channel.send(payload),
                update: async (payload) => {}, 
                deferReply: async () => {},      
                deferUpdate: async () => {}      
            };
        }

        const client = interactionOrMessage.client;
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        try {
            client.sql.prepare("ALTER TABLE levels ADD COLUMN last_dungeon INTEGER DEFAULT 0").run();
        } catch (e) { }

        if (userId !== OWNER_ID) {
            let userData = client.getLevel.get(userId, guildId);
            if (!userData) {
                client.setLevel.run({
                    id: `${guildId}-${userId}`,
                    user: userId,
                    guild: guildId,
                    xp: 0, level: 1, mora: 0
                });
                userData = client.getLevel.get(userId, guildId);
            }

            const lastDungeon = userData.last_dungeon || 0; 
            const now = Date.now();

            if (now - lastDungeon < COOLDOWN_TIME) {
                const timeLeft = COOLDOWN_TIME - (now - lastDungeon);
                const hours = Math.floor(timeLeft / (1000 * 60 * 60));
                const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                
                const msg = { content: `⏳ **هدئ من روعك أيها المحارب!**\nيجب أن تستريح قبل فتح بوابة دانجون جديدة.\nالوقت المتبقي: **${hours} ساعة و ${minutes} دقيقة**.\n\n*💡 يمكنك الانضمام لدانجون شخص آخر في أي وقت!*`, ephemeral: true };
                
                if (isSlash && !interaction.replied) return await interaction.reply(msg);
                else return await interaction.reply(msg);
            }
        }

        try {
            await startDungeon(interaction, client.sql);
        } catch (error) {
            console.error("[Dungeon Error]", error);
            const msg = { content: "❌ حدث خطأ غير متوقع في الدانجون.", ephemeral: true };
            if (isSlash && !interaction.replied) await interaction.reply(msg);
            else if (isSlash) await interaction.followUp(msg);
            else interactionOrMessage.reply(msg);
        }
    }
};
