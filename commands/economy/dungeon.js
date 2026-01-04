const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors, ChannelType } = require("discord.js");
const { runDungeon } = require("../../handlers/dungeon-battle.js"); // الهاندلر الجديد
const { dungeonConfig } = require('../../handlers/dungeon/constants.js');

const OWNER_ID = "1145327691772481577"; // الآيدي الخاص بك
const COOLDOWN_TIME = 3 * 60 * 60 * 1000; // 3 ساعات

// خريطة لتخزين الطلبات النشطة (اللوبي)
const activeDungeonRequests = new Map();

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
        // تجهيز المتغيرات لدعم السلاش والرسائل العادية
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
        const sql = client.sql; // افتراض أن الـ sql مخزن في الكلاينت

        // 🛠️ إصلاح تلقائي: التأكد من وجود عمود last_dungeon
        try {
            sql.prepare("ALTER TABLE levels ADD COLUMN last_dungeon INTEGER DEFAULT 0").run();
        } catch (e) { }

        // --- ⏳ التحقق من الكولداون ⏳ ---
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

        // --- التحقق من الطلبات النشطة ---
        if (activeDungeonRequests.has(userId)) {
            const msg = { content: '🚫 **لديك بالفعل مغامرة أو قائمة انتظار نشطة!**', ephemeral: true };
            if (isSlash && !interaction.replied) return await interaction.reply(msg);
            else return await interaction.reply(msg);
        }

        try {
            // ============================================================
            // 🔥🔥 بدء نظام اللوبي الجديد (بدلاً من startDungeon القديم) 🔥🔥
            // ============================================================
            
            const hostId = userId;
            const party = new Set([hostId]);
            const partyClasses = new Map();
            
            // تسجيل اللوبي
            activeDungeonRequests.set(hostId, { status: 'lobby' });

            // تصميم اللوبي
            const lobbyEmbed = new EmbedBuilder()
                .setTitle('⚔️ بوابـة الدانجـون: التجهيـز للمعركـة')
                .setDescription(`
**القائد:** <@${hostId}>
**المشاركون:** (1/4)
- <@${hostId}> 

اضغط **"انضمام"** للمشاركة في الغارة.
اضغط **"بدء"** للانطلاق فوراً (للقائد فقط).
                `)
                .setColor(Colors.DarkRed)
                .setImage('https://i.postimg.cc/DypZtNmr/00000.png')
                .setFooter({ text: 'يغلق اللوبي تلقائياً بعد 60 ثانية إذا لم يبدأ' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('join_dungeon').setLabel('انضمام').setStyle(ButtonStyle.Success).setEmoji('➕'),
                new ButtonBuilder().setCustomId('start_dungeon').setLabel('بدء الغارة').setStyle(ButtonStyle.Danger).setEmoji('⚔️'),
                new ButtonBuilder().setCustomId('cancel_dungeon').setLabel('إلغاء').setStyle(ButtonStyle.Secondary).setEmoji('✖️')
            );

            // إرسال الرسالة
            const reply = await interaction.reply({ embeds: [lobbyEmbed], components: [row], fetchReply: true });
            if (!isSlash) interactionOrMessage.lastBotReply = reply;

            const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

            collector.on('collect', async i => {
                // زر الإلغاء
                if (i.customId === 'cancel_dungeon') {
                    if (i.user.id !== hostId) return i.reply({ content: '🚫 فقط القائد يمكنه الإلغاء.', ephemeral: true });
                    activeDungeonRequests.delete(hostId);
                    await i.update({ content: '❌ **تم إلغاء الغارة.**', embeds: [], components: [] });
                    collector.stop('cancelled');
                    return;
                }

                // زر الانضمام
                if (i.customId === 'join_dungeon') {
                    if (party.has(i.user.id)) return i.reply({ content: '⚠️ أنت منضم بالفعل!', ephemeral: true });
                    if (activeDungeonRequests.has(i.user.id) && i.user.id !== hostId) return i.reply({ content: '🚫 لديك نشاط دانجون آخر قيد التشغيل.', ephemeral: true });
                    if (party.size >= 4) return i.reply({ content: '🚫 الفريق ممتلئ!', ephemeral: true });

                    const joinerData = sql.prepare("SELECT * FROM levels WHERE user = ? AND guild = ?").get(i.user.id, i.guild.id);
                    if (!joinerData) return i.reply({ content: '🚫 يجب أن يكون لديك سجل (لفل) للمشاركة.', ephemeral: true });

                    party.add(i.user.id);
                    
                    const updatedDesc = `
**القائد:** <@${hostId}>
**المشاركون:** (${party.size}/4)
${Array.from(party).map(id => `- <@${id}>`).join('\n')}

اضغط **"انضمام"** للمشاركة في الغارة.
اضغط **"بدء"** للانطلاق فوراً (للقائد فقط).
                    `;
                    lobbyEmbed.setDescription(updatedDesc);
                    await i.update({ embeds: [lobbyEmbed] });
                }

                // زر البدء
                if (i.customId === 'start_dungeon') {
                    if (i.user.id !== hostId) return i.reply({ content: '🚫 فقط القائد يمكنه البدء.', ephemeral: true });
                    
                    await i.update({ content: '⏳ **جاري فتح بوابة الدانجون...**', components: [] });
                    collector.stop('started');

                    // 🔥 تحديث الكولداون للقائد فقط عند البدء الفعلي 🔥
                    if (hostId !== OWNER_ID) {
                        sql.prepare("UPDATE levels SET last_dungeon = ? WHERE user = ? AND guild = ?").run(Date.now(), hostId, guildId);
                    }

                    try {
                        const thread = await i.channel.threads.create({
                            name: `غارة-${i.user.username}`,
                            autoArchiveDuration: 60,
                            type: ChannelType.PrivateThread, 
                            reason: 'Dungeon Run'
                        });

                        for (const userId of party) {
                            try { await thread.members.add(userId); } catch (e) { }
                        }

                        await thread.send(`⚔️ **بدأت المعركة!** استعدوا يا شجعان!\n${Array.from(party).map(id => `<@${id}>`).join(' ')}`);

                        const defaultTheme = dungeonConfig.themes ? dungeonConfig.themes.dark : { name: "الظلام", emoji: "🌑" };
                        
                        // 🔥 تشغيل المحرك الجديد 🔥
                        await runDungeon(thread, i.channel, Array.from(party), defaultTheme, sql, hostId, partyClasses, activeDungeonRequests);

                    } catch (err) {
                        console.error(err);
                        activeDungeonRequests.delete(hostId);
                        await i.followUp({ content: '❌ حدث خطأ أثناء إنشاء ساحة المعركة (Thread).', ephemeral: true });
                    }
                }
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time') {
                    activeDungeonRequests.delete(hostId);
                    if (reply.editable) reply.edit({ content: '⏰ **انتهى وقت الانتظار، تم إغلاق البوابة.**', components: [] }).catch(() => {});
                }
            });

        } catch (error) {
            console.error("[Dungeon Error]", error);
            const msg = { content: "❌ حدث خطأ غير متوقع في الدانجون.", ephemeral: true };
            if (isSlash && !interaction.replied) await interaction.reply(msg);
            else if (isSlash) await interaction.followUp(msg);
            else interactionOrMessage.reply(msg);
        }
    }
};
