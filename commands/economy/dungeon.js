const { SlashCommandBuilder, EmbedBuilder, Colors, MessageFlags } = require("discord.js");
// ✅ التصحيح: استدعاء الهاندلر من المسار الصحيح (الرجوع مجلدين للخلف)
const { startDungeon } = require("../../handlers/dungeon-handler.js");
const { manageTickets } = require("../../handlers/dungeon/utils.js"); 

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

        // التحقق من وجود السيرفر
        if (!guild) {
            return interaction.reply({ content: "🚫 **عذراً، هذا الأمر يعمل فقط داخل السيرفرات!**", ephemeral: true });
        }

        // 2. تحديث قاعدة البيانات (أمان) - ضمان وجود أعمدة التذاكر
        try {
            client.sql.prepare("ALTER TABLE levels ADD COLUMN last_dungeon INTEGER DEFAULT 0").run();
            client.sql.prepare("ALTER TABLE levels ADD COLUMN dungeon_tickets INTEGER DEFAULT 0").run();
            client.sql.prepare("ALTER TABLE levels ADD COLUMN last_ticket_reset TEXT DEFAULT ''").run();
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

            // إذا كان عليه كولداون (لإنشاء الدانجون كـ Host)
            if (diff < COOLDOWN_MS) {
                // جلب معلومات التذاكر (للانضمام)
                const ticketInfo = manageTickets(user.id, guild.id, client.sql, 'check');
                
                // حساب وقت انتهاء الكولداون (Timestamp) للعد التنازلي
                const readyTimestamp = Math.floor((lastRun + COOLDOWN_MS) / 1000);

                // تصميم الإيمبد الجديد (تنسيق الأسطر)
                const cooldownEmbed = new EmbedBuilder()
                    .setTitle('✥ اسـتـراحـة مـحـارب !')
                    .setDescription(
                        `★ رويـدك ايهـا المحارب ارتح قليلا قبل غزو الدانجون مجددا !\n\n` +
                        `★ يمكنك غـزو الدانجـون:\n ★ <t:${readyTimestamp}:R>\n\n` + 
                        `★ لديـك **(${ticketInfo.tickets}/${ticketInfo.max})** تـذكـرة يمكنك الانضمام لفريق آخر`
                    )
                    .setThumbnail('https://i.postimg.cc/4xMWNV22/doun.png')
                    .setColor(Math.floor(Math.random() * 0xFFFFFF)); // لون عشوائي

                const payload = { 
                    content: `⏳ **تمهّل أيها المحارب!**`, 
                    embeds: [cooldownEmbed], 
                    flags: [MessageFlags.Ephemeral] 
                };

                // تجنب الرد المزدوج
                if (isSlash && (interaction.replied || interaction.deferred)) {
                    return await interaction.followUp(payload);
                }
                return await interaction.reply(payload);
            }
        }

        // 4. تشغيل النظام عبر الهاندلر
        try {
            await startDungeon(interaction, client.sql);
        } catch (err) {
            console.error("[Dungeon Command Error]", err);
            const errMsg = { content: "❌ حدث خطأ تقني أثناء بدء الدانجون.", flags: [MessageFlags.Ephemeral] };
            
            if (interaction.replied || interaction.deferred) await interaction.followUp(errMsg);
            else await interaction.reply(errMsg);
        }
    }
};
