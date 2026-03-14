const { AttachmentBuilder, SlashCommandBuilder } = require("discord.js");
const Canvas = require('canvas');
const path = require('path');

const EMPEROR_ID = '1145327691772481577';
const EMPEROR_CARD_URL = 'https://i.postimg.cc/8CK5jbWN/card-(2).jpg';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('رصيد')
        .setDescription('يعرض رصيدك من المورا في بطاقة بنكية احترافية.')
        .addUserOption(option => 
            option.setName('المستخدم')
            .setDescription('المستخدم الذي تريد عرض رصيده (اختياري)')
            .setRequired(false)),

    name: 'balance',
    aliases: ['bal', 'mora', 'رصيد', 'مورا','فلوس'],
    category: "Economy",
    description: "يعرض رصيدك من المورا.",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, member, client, guild;
        let user; 
        let commandAuthor; 

        try {
            if (isSlash) {
                interaction = interactionOrMessage;
                client = interaction.client;
                guild = interaction.guild;
                commandAuthor = interaction.user;
                const targetUser = interaction.options.getUser('المستخدم') || interaction.user;
                user = targetUser;
                member = await guild.members.fetch(targetUser.id).catch(() => null);

                if (!member) {
                    return interaction.reply({ content: 'لم أتمكن من العثور على هذا العضو في السيرفر.', ephemeral: true });
                }
                await interaction.deferReply();
            } else {
                message = interactionOrMessage;
                client = message.client;
                guild = message.guild;
                commandAuthor = message.author;
                member = message.mentions.members.first() || message.guild.members.cache.get(args[0]) || message.member;
                user = member.user;
            }

            const reply = async (payload) => {
                if (isSlash) return interaction.editReply(payload);
                return message.channel.send(payload);
            };

            if (user.id === EMPEROR_ID && commandAuthor.id !== EMPEROR_ID) {
                return await reply({ files: [EMPEROR_CARD_URL] });
            }

            // 🔥 التعديل الجوهري: جلب البيانات الحية مباشرة من قاعدة البيانات 🔥
            let liveData;
            try {
                // نحاول الجلب باستخدام أسماء الأعمدة المحمية
                const res = await client.sql.query(`SELECT "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guild.id]);
                if (res.rows.length > 0) {
                    liveData = res.rows[0];
                } else {
                    // إذا لم يوجد حساب، نستخدم البيانات الافتراضية
                    liveData = { mora: 0, bank: 0 };
                }
            } catch (e) {
                // Fallback في حال كانت أسماء الأعمدة مختلفة (userid/guildid)
                const res = await client.sql.query(`SELECT mora, bank FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guild.id]).catch(() => null);
                liveData = res?.rows?.[0] || { mora: 0, bank: 0 };
            }

            const safeMora = Number(liveData.mora || liveData.mora) || 0;
            const safeBank = Number(liveData.bank || liveData.bank) || 0;

            // تحديث الذاكرة المؤقتة (Cache) لكي لا يحدث تضارب في الأوامر الأخرى
            let cachedData = await client.getLevel(user.id, guild.id);
            if (cachedData) {
                cachedData.mora = safeMora;
                cachedData.bank = safeBank;
                // لا نحتاج لعمل setLevel هنا لأننا نريد فقط تحديث الذاكرة للعرض
            }

            const canvas = Canvas.createCanvas(1000, 400); 
            const context = canvas.getContext('2d');

            const bgPath = path.join(__dirname, '../../images/card.png');
            const background = await Canvas.loadImage(bgPath);
            context.drawImage(background, 0, 0, canvas.width, canvas.height);

            context.save();
            context.beginPath();
            context.arc(165, 200, 65, 0, Math.PI * 2, true); 
            context.closePath();
            context.clip();

            const avatar = await Canvas.loadImage(user.displayAvatarURL({ extension: 'png' }));
            context.drawImage(avatar, 90, 125, 150, 150); 
            context.restore();

            context.textAlign = 'left';
            context.fillStyle = '#E0B04A'; 
            context.font = 'bold 48px "Cairo"'; 

            context.fillText(safeMora.toLocaleString(), 335, 235); 
            context.fillText(safeBank.toLocaleString(), 335, 340); 

            const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'mora-card.png' });

            await reply({ files: [attachment] });

        } catch (error) {
            console.error("Error creating balance card:", error);
            const errorPayload = { content: "حدث خطأ أثناء إنشاء بطاقة الرصيد.", ephemeral: true };
            if (isSlash) {
                if (interaction.deferred || interaction.replied) await interaction.editReply(errorPayload);
                else await interaction.reply(errorPayload);
            } else message.reply(errorPayload.content);
        }
    }
};
