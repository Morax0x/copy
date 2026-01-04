const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors, ChannelType } = require('discord.js');
const { runDungeon } = require('../../handlers/dungeon-battle.js'); // استدعاء النظام الجديد
const { dungeonConfig } = require('../../handlers/dungeon/constants.js');

const activeDungeonRequests = new Map();
const COOLDOWN_TIME = 3 * 60 * 60 * 1000; // 3 ساعات

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dungeon')
        .setDescription('⚔️ ادخل الدانجون وحارب الوحوش !')
        .setDMPermission(false),

    name: 'dungeon',
    aliases: ['دانجون', 'برج', 'dgn'],
    category: "Economy",
    description: "نظام الدانجون المتقدم (PvE)",

    async execute(interactionOrMessage, args, sql) { // تأكدنا من تمرير sql هنا
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction;

        // توحيد التعامل بين السلاش والرسائل العادية
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
                editReply: async (payload) => message.channel.send(payload),
                followUp: async (payload) => message.channel.send(payload),
                update: async () => {},
                deferReply: async () => {},
                deferUpdate: async () => {}
            };
        }

        const client = interactionOrMessage.client;
        const db = client.sql || sql; // ضمان وجود الداتابيس

        // 1. التحقق من الكولداون (Cooldown)
        const userData = db.prepare("SELECT * FROM levels WHERE user = ? AND guild = ?").get(interaction.user.id, interaction.guild.id);
        
        if (!userData) {
            const msg = { content: '🚫 يجب أن يكون لديك سجل (لفل) للمشاركة. تحدث قليلاً لتسجيلك.', ephemeral: true };
            return isSlash ? interaction.reply(msg) : interaction.reply(msg);
        }

        // إذا لم يكن المطور، نطبق الكولداون
        if (interaction.user.id !== "1145327691772481577") { // OWNER_ID
            const lastDungeon = userData.last_dungeon || 0;
            const now = Date.now();
            if (now - lastDungeon < COOLDOWN_TIME) {
                const timeLeft = COOLDOWN_TIME - (now - lastDungeon);
                const hours = Math.floor(timeLeft / (1000 * 60 * 60));
                const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                const msg = { content: `⏳ **هدئ من روعك!**\nيجب أن تستريح. المتبقي: **${hours} س و ${minutes} د**.\n*💡 يمكنك الانضمام لدانجون شخص آخر!*`, ephemeral: true };
                return isSlash ? interaction.reply(msg) : interaction.reply(msg);
            }
        }

        // 2. التحقق من وجود طلب نشط
        if (activeDungeonRequests.has(interaction.user.id)) {
            const msg = { content: '🚫 **لديك بالفعل مغامرة أو قائمة انتظار نشطة!**', ephemeral: true };
            return isSlash ? interaction.reply(msg) : interaction.reply(msg);
        }

        // إعداد المتغيرات
        const hostId = interaction.user.id;
        const party = new Set([hostId]); 
        const partyClasses = new Map(); 
        
        activeDungeonRequests.set(hostId, { status: 'lobby' });

        // --- تصميم اللوبي ---
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

        let reply;
        if (isSlash) {
            reply = await interaction.reply({ embeds: [lobbyEmbed], components: [row], fetchReply: true });
        } else {
            reply = await interaction.reply({ embeds: [lobbyEmbed], components: [row] });
        }

        const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

        collector.on('collect', async i => {
            if (i.customId === 'cancel_dungeon') {
                if (i.user.id !== hostId) return i.reply({ content: '🚫 فقط القائد يمكنه الإلغاء.', ephemeral: true });
                activeDungeonRequests.delete(hostId);
                await i.update({ content: '❌ **تم إلغاء الغارة.**', embeds: [], components: [] });
                collector.stop('cancelled');
                return;
            }

            if (i.customId === 'join_dungeon') {
                if (party.has(i.user.id)) return i.reply({ content: '⚠️ أنت منضم بالفعل!', ephemeral: true });
                if (activeDungeonRequests.has(i.user.id) && i.user.id !== hostId) return i.reply({ content: '🚫 لديك نشاط دانجون آخر قيد التشغيل.', ephemeral: true });
                if (party.size >= 4) return i.reply({ content: '🚫 الفريق ممتلئ!', ephemeral: true });

                const joinerData = db.prepare("SELECT * FROM levels WHERE user = ? AND guild = ?").get(i.user.id, i.guild.id);
                if (!joinerData) return i.reply({ content: '🚫 يجب أن يكون لديك سجل (لفل) للمشاركة.', ephemeral: true });

                // التحقق من كولداون المنضم (اختياري، حالياً معطل للمنضمين لتشجيع اللعب الجماعي)
                // if (Date.now() - (joinerData.last_dungeon || 0) < COOLDOWN_TIME) ...

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

            if (i.customId === 'start_dungeon') {
                if (i.user.id !== hostId) return i.reply({ content: '🚫 فقط القائد يمكنه البدء.', ephemeral: true });
                
                await i.update({ content: '⏳ **جاري فتح بوابة الدانجون...**', components: [] });
                collector.stop('started');

                // تسجيل وقت الكولداون للقائد فقط
                db.prepare("UPDATE levels SET last_dungeon = ? WHERE user = ? AND guild = ?").run(Date.now(), hostId, interaction.guild.id);

                try {
                    // إنشاء ثريد
                    const thread = await interaction.channel.threads.create({
                        name: `غارة-${interaction.user.username}`,
                        autoArchiveDuration: 60,
                        type: ChannelType.PrivateThread, 
                        reason: 'Dungeon Run'
                    });

                    for (const userId of party) {
                        try { await thread.members.add(userId); } catch (e) { }
                    }

                    await thread.send(`⚔️ **بدأت المعركة!** استعدوا يا شجعان!\n${Array.from(party).map(id => `<@${id}>`).join(' ')}`);

                    // 🔥 تشغيل الدانجون الجديد 🔥
                    const defaultTheme = dungeonConfig.themes ? dungeonConfig.themes.dark : { name: "الظلام", emoji: "🌑" };
                    await runDungeon(thread, interaction.channel, Array.from(party), defaultTheme, db, hostId, partyClasses, activeDungeonRequests);

                } catch (err) {
                    console.error(err);
                    activeDungeonRequests.delete(hostId);
                    await interaction.followUp({ content: '❌ حدث خطأ أثناء إنشاء ساحة المعركة (Thread).', ephemeral: true });
                }
            }
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                activeDungeonRequests.delete(hostId);
                // محاولة تعديل الرسالة إذا لم تكن قد حذفت
                if (reply && reply.editable) {
                    reply.edit({ content: '⏰ **انتهى وقت الانتظار، تم إغلاق البوابة.**', components: [] }).catch(() => {});
                }
            }
        });
    }
};
