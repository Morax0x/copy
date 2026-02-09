const { SlashCommandBuilder, EmbedBuilder, Colors, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const { manageTickets } = require("../../handlers/dungeon/utils.js");
const { startDungeonLobby } = require("../../handlers/dungeon/core/setup.js");

const OWNER_ID = "1145327691772481577";
const COOLDOWN_MS = 1 * 60 * 60 * 1000; // ساعة واحدة

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
        // 1. تحديد نوع التفاعل
        const isSlash = context.isChatInputCommand === true;
        let interaction;

        if (isSlash) {
            interaction = context;
        } else {
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

        // 2. تحديث قاعدة البيانات (أمان)
        try {
            client.sql.prepare("ALTER TABLE levels ADD COLUMN last_dungeon INTEGER DEFAULT 0").run();
            client.sql.prepare("ALTER TABLE levels ADD COLUMN dungeon_tickets INTEGER DEFAULT 0").run();
            client.sql.prepare("ALTER TABLE levels ADD COLUMN last_ticket_reset TEXT DEFAULT ''").run();
            client.sql.prepare("CREATE TABLE IF NOT EXISTS dungeon_saves (hostID TEXT PRIMARY KEY, guildID TEXT, floor INTEGER, timestamp INTEGER)").run();
        } catch (ignored) {}

        // 3. التحقق من وقت الانتظار (Cooldown)
        if (user.id !== OWNER_ID) {
            let userData = client.getLevel.get(user.id, guild.id);
            
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
                // ✅ استخدام الدالة الصحيحة لفحص التذاكر
                const limitInfo = manageTickets(user.id, guild.id, client.sql, 'check', interaction.member);
                const readyTimestamp = Math.floor((lastRun + COOLDOWN_MS) / 1000);

                const cooldownEmbed = new EmbedBuilder()
                    .setTitle('✥ اسـتـراحـة مـحـارب !')
                    .setDescription(
                        `★ رويـدك ايهـا المحارب ارتح قليلا قبل غزو الدانجون مجددا !\n\n` +
                        `★ يمكنك غـزو الدانجـون:\n ★ <t:${readyTimestamp}:R>\n\n` + 
                        `★ لديـك **(${limitInfo.tickets}/${limitInfo.max})** تذكرة يمكنك الانضمام لفريق آخر`
                    )
                    .setThumbnail('https://i.postimg.cc/4xMWNV22/doun.png')
                    .setColor(Math.floor(Math.random() * 0xFFFFFF));

                const payload = { embeds: [cooldownEmbed], flags: [MessageFlags.Ephemeral] };

                if (isSlash && (interaction.replied || interaction.deferred)) {
                    return await interaction.followUp(payload);
                }
                return await interaction.reply(payload);
            }
        }

        // ====================================================
        // 🔥🔥 نظام استكمال الدانجون (Campfire System) 🔥🔥
        // ====================================================
        
        // 1. فحص التذاكر أولاً (✅ التصحيح هنا: استخدام manageTickets)
        const ticketCheck = manageTickets(user.id, guild.id, client.sql, 'check', interaction.member);
        
        if (ticketCheck.tickets < 1) {
             return interaction.reply({ content: "🚫 **لا تملك تذاكر كافية لفتح بوابة الدانجون!**", flags: [MessageFlags.Ephemeral] });
        }

        // 2. فحص ملف الحفظ
        const save = client.sql.prepare("SELECT * FROM dungeon_saves WHERE hostID = ?").get(user.id);
        let startFloor = 1;

        if (save) {
            // تحديد مدة الصلاحية حسب الرتب
            let expiryTime = 24 * 60 * 60 * 1000; // الافتراضي: 24 ساعة
            const member = interaction.member;
            
            if (member.roles.cache.has('1422160802416164885')) expiryTime = 72 * 60 * 60 * 1000; // 3 أيام
            else if (member.roles.cache.has('1395674235002945636')) expiryTime = 35 * 60 * 60 * 1000; // 35 ساعة

            const timeLeft = expiryTime - (Date.now() - save.timestamp);

            if (timeLeft > 0) {
                // يوجد حفظ ساري المفعول
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('resume_dungeon').setLabel(`استكمال (طابق ${save.floor})`).setStyle(ButtonStyle.Success).setEmoji('⛺'),
                    new ButtonBuilder().setCustomId('new_dungeon').setLabel('بداية جديدة').setStyle(ButtonStyle.Secondary).setEmoji('⚔️')
                );

                const replyMsg = await interaction.reply({
                    content: `👑 **عثرنا على رحلة سابقة توقفت عند الطابق ${save.floor}.. هل تود استكمالها؟**\n⏳ ينتهي المخيم بعد: <t:${Math.floor((Date.now() + timeLeft) / 1000)}:R>`,
                    components: [row],
                    fetchReply: true 
                });

                try {
                    const filter = i => i.user.id === user.id;
                    const collector = replyMsg.createMessageComponentCollector({ filter, time: 30000, max: 1 });

                    collector.on('collect', async i => {
                        if (i.customId === 'resume_dungeon') {
                            startFloor = save.floor;
                            await i.update({ content: `⛺ **تم استكمال الرحلة من الطابق ${startFloor}!**`, components: [] });
                        } else {
                            await i.update({ content: `⚔️ **تم إلغاء المخيم وبدء رحلة جديدة من الطابق 1!**`, components: [] });
                        }
                        
                        // حذف الحفظ بعد الاستخدام (Anti-Farm)
                        client.sql.prepare("DELETE FROM dungeon_saves WHERE hostID = ?").run(user.id);
                        
                        // 🔥 خصم التذكرة الآن (القائد فقط) 🔥
                        manageTickets(user.id, guild.id, client.sql, 'consume', interaction.member);

                        // بدء الدانجون
                        await startDungeonLobby(interaction, startFloor);
                    });

                    collector.on('end', collected => {
                        if (collected.size === 0) {
                            interaction.editReply({ content: '⏰ **انتهى الوقت!** يرجى كتابة الأمر مرة أخرى.', components: [] }).catch(() => {});
                        }
                    });
                    
                    return; 

                } catch (e) {
                    console.log(e);
                }
            } else {
                // الحفظ منتهي الصلاحية -> حذف وتجاهل
                client.sql.prepare("DELETE FROM dungeon_saves WHERE hostID = ?").run(user.id);
            }
        }

        // 4. تشغيل النظام العادي (إذا لم يكن هناك حفظ أو انتهى الوقت)
        try {
            // 🔥 خصم التذكرة الآن (القائد فقط) 🔥
            manageTickets(user.id, guild.id, client.sql, 'consume', interaction.member);

            // بدء اللوبي من الطابق 1
            await startDungeonLobby(interaction, 1);
        } catch (err) {
            console.error("[Dungeon Command Error]", err);
            const errMsg = { content: "❌ حدث خطأ تقني أثناء بدء الدانجون.", flags: [MessageFlags.Ephemeral] };
            
            if (interaction.replied || interaction.deferred) await interaction.followUp(errMsg);
            else await interaction.reply(errMsg);
        }
    }
};
