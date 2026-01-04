const { SlashCommandBuilder } = require("discord.js");
const { startDungeon } = require("../../handlers/dungeon-handler.js");

const OWNER_ID = "1145327691772481577";
const COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3 ساعات

module.exports = {
    // إعدادات سلاش كوماند
    data: new SlashCommandBuilder()
        .setName('dungeon')
        .setDescription('⚔️ ادخل الدانجون وحارب الوحوش !')
        .setDMPermission(false),

    // إعدادات البريفكس
    name: 'dungeon',
    aliases: ['دانجون', 'برج', 'dgn'],
    category: "Economy",
    description: "نظام الدانجون المتقدم (PvE)",

    async execute(context, args) {
        // 1. تحديد نوع التفاعل (Slash vs Message)
        const isSlash = context.isChatInputCommand === true;
        let interaction;

        if (isSlash) {
            interaction = context;
        } else {
            // محاكاة الانترآكشن للرسائل العادية
            interaction = {
                user: context.author,
                guild: context.guild,
                member: context.member,
                channel: context.channel,
                client: context.client,
                id: context.id,
                isChatInputCommand: false,
                reply: async (payload) => context.reply(payload),
                editReply: async (payload) => {
                    if (context.lastBotReply) return context.lastBotReply.edit(payload);
                    return context.channel.send(payload);
                },
                followUp: async (payload) => context.channel.send(payload),
                deferReply: async () => {},
                deferUpdate: async () => {}
            };
        }

        const { client, user, guild } = interaction;

        // 2. تحديث قاعدة البيانات (أمان)
        try {
            client.sql.prepare("ALTER TABLE levels ADD COLUMN last_dungeon INTEGER DEFAULT 0").run();
        } catch (ignored) {}

        // 3. التحقق من وقت الانتظار (Cooldown)
        if (user.id !== OWNER_ID) {
            let userData = client.getLevel.get(user.id, guild.id);
            
            // إنشاء بيانات للمستخدم الجديد
            if (!userData) {
                client.setLevel.run({
                    id: `${guild.id}-${user.id}`,
                    user: user.id,
                    guild: guild.id,
                    xp: 0, level: 1, mora: 0
                });
                userData = client.getLevel.get(user.id, guild.id);
            }

            const lastRun = userData.last_dungeon || 0;
            const now = Date.now();
            const diff = now - lastRun;

            if (diff < COOLDOWN_MS) {
                const remaining = COOLDOWN_MS - diff;
                const hours = Math.floor(remaining / 3600000);
                const minutes = Math.floor((remaining % 3600000) / 60000);

                const cooldownMsg = { 
                    content: `⏳ **تمهّل أيها المحارب!**\nيجب أن ترتاح قبل خوض معركة جديدة.\nالوقت المتبقي: **${hours} ساعة و ${minutes} دقيقة**.\n\n*💡 يمكنك الانضمام لفريق شخص آخر في أي وقت!*`, 
                    ephemeral: true 
                };

                if (isSlash && !interaction.replied) return await interaction.reply(cooldownMsg);
                return await interaction.reply(cooldownMsg);
            }
        }

        // 4. تشغيل النظام
        try {
            await startDungeon(interaction, client.sql);
        } catch (err) {
            console.error("[Dungeon Command Error]", err);
            const errMsg = { content: "❌ حدث خطأ تقني أثناء بدء الدانجون.", ephemeral: true };
            
            if (isSlash && !interaction.replied) await interaction.reply(errMsg);
            else if (isSlash) await interaction.followUp(errMsg);
            else await interaction.reply(errMsg);
        }
    }
};
