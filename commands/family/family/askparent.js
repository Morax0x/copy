const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors } = require("discord.js");

const ADOPT_REQUEST_FEE = 1000; // رسوم طلب الانضمام
const MAX_CHILDREN = 10;
const MORA_EMOJI = '<:mora:1435647151349698621>'; 
const SUCCESS_IMAGE = "https://i.postimg.cc/NFjJ9WGf/09888ef8ca948e79af1de55c4133ba56.gif";

module.exports = {
    data: new SlashCommandBuilder()
        .setName('askparent')
        .setDescription('طلب من شخص أن يتبناك (تصبح ابنه).')
        .addUserOption(option => 
            option.setName('parent')
                .setDescription('الشخص الذي تريد أن يكون والدك')
                .setRequired(true)),

    name: 'askparent',
    aliases: ['اب', 'طلب-اب', 'ام', 'bechild'],
    category: "Family",
    description: "طلب الانضمام لعائلة كابن.",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, user, parentUser, channel, client;

        if (isSlash) {
            interaction = interactionOrMessage;
            user = interaction.user;
            parentUser = interaction.options.getUser('parent');
            channel = interaction.channel;
            client = interaction.client;
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            user = message.author;
            parentUser = message.mentions.users.first();
            channel = message.channel;
            client = message.client;
        }

        // دالة الرد (مع دعم الحذف التلقائي للأخطاء)
        const reply = async (payload, autoDelete = false) => {
            let msg;
            if (isSlash) msg = await interaction.editReply(payload);
            else msg = await message.reply(payload);

            if (autoDelete) {
                setTimeout(() => msg.delete().catch(() => {}), 5000);
            }
            return msg;
        };

        const sql = client.sql;
        const guildId = isSlash ? interaction.guild.id : message.guild.id;

        // 1. فحوصات أساسية
        if (!parentUser) return reply("❌ يرجى تحديد الأب/الأم المحتمل!", true);
        if (parentUser.bot) return reply("🤖 الروبوتات لا تتبنى البشر!", true);
        if (parentUser.id === user.id) return reply("❌ لا يمكنك تبني نفسك!", true);

        // 2. فحص الرصيد (الابن يدفع)
        let childData = client.getLevel.get(user.id, guildId);
        if (!childData) childData = { id: `${guildId}-${user.id}`, user: user.id, guild: guildId, xp: 0, level: 1, mora: 0 };

        if (childData.mora < ADOPT_REQUEST_FEE) {
            return reply(`💸 **ليس لديك مورا كافية لتقديم الطلب!**\nالرسوم المطلوبة: **${ADOPT_REQUEST_FEE.toLocaleString()}** ${MORA_EMOJI}`, true);
        }

        // 3. فحوصات العائلة (الداتابيس)
        
        // أ. هل أنت لديك أب بالفعل؟
        const existingParent = sql.prepare("SELECT parentID FROM children WHERE childID = ? AND guildID = ?").get(user.id, guildId);
        if (existingParent) return reply("❌ **لديك عائلة بالفعل!** لا يمكنك البحث عن أب جديد وأنت على ذمة عائلة.", true);

        // ب. هل الأب المحتمل وصل للحد الأقصى؟
        const parentsChildrenCount = sql.prepare("SELECT count(*) as count FROM children WHERE parentID = ? AND guildID = ?").get(parentUser.id, guildId).count;
        if (parentsChildrenCount >= MAX_CHILDREN) return reply(`🚫 **${parentUser.username}** لديه الحد الأقصى من الأطفال (${MAX_CHILDREN})!`, true);

        // ج. منع الدورات (هل الأب المحتمل هو ابنك؟)
        const isHeMyChild = sql.prepare("SELECT 1 FROM children WHERE parentID = ? AND childID = ?").get(user.id, parentUser.id);
        if (isHeMyChild) return reply("😵‍💫 **لا يعقل!** هذا الشخص هو ابنك، كيف تطلب منه أن يتبناك؟", true);

        // د. هل الأب المحتمل هو زوجك؟
        const marriageCheck = sql.prepare("SELECT partnerID FROM marriages WHERE userID = ? AND guildID = ?").get(user.id, guildId);
        if (marriageCheck && marriageCheck.partnerID === parentUser.id) return reply("🚫 لا يمكنك أن تكون ابناً لشريك حياتك!", true);

        // 4. إرسال الطلب للأب
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('accept_child').setLabel('قبول الانضمام ✅').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('decline_child').setLabel('رفض ❌').setStyle(ButtonStyle.Danger)
        );

        const embed = new EmbedBuilder()
            .setTitle('📜 طلب انضمام للعائلة')
            .setDescription(
                `يا **${parentUser}**،\n` +
                `يتقدم **${user}** بطلب رسمي للانضمام لعائلتك كابن لك.\n` +
                `💰 **رسوم التسجيل:** سيدفع الابن **${ADOPT_REQUEST_FEE}** ${MORA_EMOJI} كهدية لك.`
            )
            .setColor(Colors.Gold)
            .setThumbnail(user.displayAvatarURL())
            .setFooter({ text: 'نظام العائلة • الإمبراطورية' });

        const msgContent = { content: `${parentUser}`, embeds: [embed], components: [row] };
        const msg = isSlash ? await interaction.editReply(msgContent) : await channel.send(msgContent);

        // كوليكتور للأب
        const filter = i => i.user.id === parentUser.id;
        const collector = msg.createMessageComponentCollector({ filter, componentType: ComponentType.Button, time: 60000 });

        collector.on('collect', async i => {
            if (i.customId === 'decline_child') {
                await i.update({ content: `💔 **رفض الأب الطلب.** حظاً أوفر في المرة القادمة.`, embeds: [], components: [] });
                return;
            }

            if (i.customId === 'accept_child') {
                // إعادة فحص المال
                childData = client.getLevel.get(user.id, guildId);
                if (childData.mora < ADOPT_REQUEST_FEE) {
                    return i.update({ content: `❌ **فشلت العملية:** الابن أفلس أثناء الانتظار!`, embeds: [], components: [] });
                }

                // 1. خصم من الابن وإعطاء الأب
                childData.mora -= ADOPT_REQUEST_FEE;
                client.setLevel.run(childData);

                let parentData = client.getLevel.get(parentUser.id, guildId);
                if (!parentData) parentData = { id: `${guildId}-${parentUser.id}`, user: parentUser.id, guild: guildId, xp: 0, level: 1, mora: 0 };
                parentData.mora += ADOPT_REQUEST_FEE;
                client.setLevel.run(parentData);

                // 2. التسجيل في الداتابيس (للأب)
                const now = Date.now();
                const stmt = sql.prepare("INSERT INTO children (parentID, childID, adoptDate, guildID) VALUES (?, ?, ?, ?)");
                stmt.run(parentUser.id, user.id, now, guildId);

                // 3. التسجيل للشريك (إذا كان الأب متزوجاً) - ليظهر عند الأم أيضاً
                const parentMarriage = sql.prepare("SELECT partnerID FROM marriages WHERE userID = ? AND guildID = ?").get(parentUser.id, guildId);
                let partnerText = "";
                
                if (parentMarriage) {
                    // نتأكد أننا لا نسجل مرتين
                    const checkPartnerChild = sql.prepare("SELECT 1 FROM children WHERE parentID = ? AND childID = ?").get(parentMarriage.partnerID, user.id);
                    if (!checkPartnerChild) {
                        stmt.run(parentMarriage.partnerID, user.id, now, guildId);
                        partnerText = " وشريكه";
                    }
                }

                const successEmbed = new EmbedBuilder()
                    .setColor(Colors.Green)
                    .setTitle('🎉 تمت عملية التبني بنجاح!')
                    .setDescription(`أصبح **${user}** رسمياً ابناً لـ **${parentUser}**${partnerText}!\nتم تحويل **${ADOPT_REQUEST_FEE}** ${MORA_EMOJI} للأب.`)
                    .setImage(SUCCESS_IMAGE); 

                await i.update({ content: `||${user} ${parentUser}||`, embeds: [successEmbed], components: [] });
            }
        });

        collector.on('end', (c, reason) => {
            if (reason === 'time') msg.edit({ content: '⏳ انتهى وقت الطلب.', components: [], embeds: [] }).catch(()=>{});
        });
    }
};
