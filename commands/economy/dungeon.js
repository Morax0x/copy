const { SlashCommandBuilder, EmbedBuilder, Colors, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
// ✅ استدعاء الهاندلر من المسار الصحيح
const { startDungeon } = require("../../handlers/dungeon-handler.js");
// ✅ استدعاء دالة إدارة الحد اليومي
const { manageTickets } = require("../../handlers/dungeon/utils.js");
// ✅ استدعاء دالة بدء اللوبي لاستخدامها عند الاستكمال
const { startDungeonLobby } = require("../../handlers/dungeon/core/setup.js");

const OWNER_ID = "1145327691772481577";
const COOLDOWN_MS = 1 * 60 * 60 * 1000; // 🔥 تعديل: ساعة واحدة لتوافق الهاندلر 🔥

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
                deferUpdate: async () => {},
                awaitMessageComponent: (options) => context.channel.awaitMessageComponent(options)
            };
        }

        const { client, user, guild } = interaction;

        // التحقق من وجود السيرفر
        if (!guild) {
            return interaction.reply({ content: "🚫 **عذراً، هذا الأمر يعمل فقط داخل السيرفرات!**", ephemeral: true });
        }

        // 2. تحديث قاعدة البيانات (أمان) - ضمان وجود أعمدة التذاكر وجدول الحفظ
        try {
            client.sql.prepare("ALTER TABLE levels ADD COLUMN last_dungeon INTEGER DEFAULT 0").run();
            client.sql.prepare("ALTER TABLE levels ADD COLUMN dungeon_tickets INTEGER DEFAULT 0").run();
            client.sql.prepare("ALTER TABLE levels ADD COLUMN last_ticket_reset TEXT DEFAULT ''").run();
            // 🔥 إضافة جدول الحفظ 🔥
            client.sql.prepare("CREATE TABLE IF NOT EXISTS dungeon_saves (hostID TEXT PRIMARY KEY, guildID TEXT, floor INTEGER, timestamp INTEGER)").run();
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
                // جلب معلومات الحد اليومي (للانضمام)
                const limitInfo = manageTickets(user.id, guild.id, client.sql, 'check', interaction.member);
                
                // حساب وقت انتهاء الكولداون (Timestamp) للعد التنازلي
                const readyTimestamp = Math.floor((lastRun + COOLDOWN_MS) / 1000);

                // تصميم الإيمبد الجديد (تنسيق الأسطر)
                const cooldownEmbed = new EmbedBuilder()
                    .setTitle('✥ اسـتـراحـة مـحـارب !')
                    .setDescription(
                        `★ رويـدك ايهـا المحارب ارتح قليلا قبل غزو الدانجون مجددا !\n\n` +
                        `★ يمكنك غـزو الدانجـون:\n ★ <t:${readyTimestamp}:R>\n\n` + 
                        `★ لديـك **(${limitInfo.tickets}/${limitInfo.max})** تذكرة يمكنك الانضمام لفريق آخر`
                    )
                    .setThumbnail('https://i.postimg.cc/4xMWNV22/doun.png')
                    .setColor(Math.floor(Math.random() * 0xFFFFFF)); // لون عشوائي

                const payload = { 
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

        // ====================================================
        // 🔥🔥 نظام استكمال الدانجون (Campfire System) 🔥🔥
        // ====================================================
        
        // 1. فحص ملف الحفظ (بدون التأثير على السستم القديم)
        const save = client.sql.prepare("SELECT * FROM dungeon_saves WHERE hostID = ?").get(user.id);
        
        if (save) {
            // تحديد مدة الصلاحية حسب الرتب
            let expiryTime = 24 * 60 * 60 * 1000; // الافتراضي: 24 ساعة
            const member = interaction.member;
            
            if (member.roles.cache.has('1422160802416164885')) expiryTime = 72 * 60 * 60 * 1000; // 3 أيام
            else if (member.roles.cache.has('1395674235002945636')) expiryTime = 35 * 60 * 60 * 1000; // 35 ساعة

            const timeLeft = expiryTime - (Date.now() - save.timestamp);

            if (timeLeft > 0) {
                // يوجد حفظ ساري المفعول -> نعرض خيار الاستكمال
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('resume_dungeon').setLabel(`استكمال (طابق ${save.floor})`).setStyle(ButtonStyle.Success).setEmoji('⛺'),
                    new ButtonBuilder().setCustomId('new_dungeon').setLabel('بداية جديدة').setStyle(ButtonStyle.Secondary).setEmoji('⚔️')
                );

                const replyPayload = {
                    content: `👑 **عثرنا على رحلة سابقة توقفت عند الطابق ${save.floor}.. هل تود استكمالها؟**\n⏳ ينتهي المخيم بعد: <t:${Math.floor((Date.now() + timeLeft) / 1000)}:R>`,
                    components: [row],
                    fetchReply: true
                };

                // إرسال الرسالة وانتظار الرد
                let replyMsg;
                if (isSlash) replyMsg = await interaction.reply(replyPayload);
                else replyMsg = await context.reply(replyPayload);

                try {
                    const filter = i => i.user.id === user.id;
                    const collector = replyMsg.createMessageComponentCollector({ filter, time: 30000, max: 1 });

                    collector.on('collect', async i => {
                        if (i.customId === 'resume_dungeon') {
                            await i.update({ content: `⛺ **تم استكمال الرحلة من الطابق ${save.floor}!**`, components: [] });
                            // حذف الحفظ بعد الاستخدام (Anti-Farm)
                            client.sql.prepare("DELETE FROM dungeon_saves WHERE hostID = ?").run(user.id);
                            
                            // 🔥 بدء الدانجون من الطابق المحفوظ 🔥
                            // ملاحظة: هنا نستدعي اللوبي مباشرة مع تمرير الطابق
                            await startDungeonLobby(interaction, save.floor); 
                        } else {
                            await i.update({ content: `⚔️ **تم إلغاء المخيم وبدء رحلة جديدة من الطابق 1!**`, components: [] });
                            client.sql.prepare("DELETE FROM dungeon_saves WHERE hostID = ?").run(user.id);
                            
                            // 🔥 بدء دانجون جديد كالمعتاد 🔥
                            await startDungeon(interaction, client.sql);
                        }
                    });

                    collector.on('end', collected => {
                        if (collected.size === 0) {
                            if (replyMsg.editable) replyMsg.edit({ content: '⏰ **انتهى الوقت!** يرجى كتابة الأمر مرة أخرى.', components: [] }).catch(() => {});
                        }
                    });
                    
                    return; // ⛔ نخرج من الدالة لننتظر خيار اللاعب (لا نشغل startDungeon تلقائياً)

                } catch (e) {
                    console.log(e);
                }
            } else {
                // الحفظ منتهي الصلاحية -> حذف وتجاهل واكمال الكود لبدء دانجون جديد
                client.sql.prepare("DELETE FROM dungeon_saves WHERE hostID = ?").run(user.id);
            }
        }

        // 4. تشغيل النظام عبر الهاندلر (إذا لم يكن هناك حفظ)
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
