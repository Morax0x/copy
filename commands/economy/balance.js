const { AttachmentBuilder, SlashCommandBuilder } = require("discord.js");
const Canvas = require('canvas');

const EMPEROR_ID = '1145327691772481577';
const EMPEROR_CARD_URL = 'https://i.postimg.cc/8CK5jbWN/card-(2).jpg';
const R2_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';

let cachedBackground = null;

async function getBackground() {
    if (cachedBackground) return cachedBackground;
    const bgUrl = `${R2_URL}/images/card.png`;
    try {
        cachedBackground = await Canvas.loadImage(bgUrl);
    } catch (error) {
        console.error("[Balance] Failed to load card background from R2:", error);
    }
    return cachedBackground;
}

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

            if (user.id === EMPEROR_ID && commandAuthor.id !== EMPEROR_ID) {
                const payload = { files: [EMPEROR_CARD_URL] };
                if (isSlash) return await interaction.editReply(payload);
                return await message.channel.send(payload);
            }

            let safeMora = 0;
            let safeBank = 0;

            try {
                const res = await client.sql.query(`SELECT "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guild.id]);
                if (res.rows.length > 0) {
                    safeMora = Number(res.rows[0].mora) || 0;
                    safeBank = Number(res.rows[0].bank) || 0;
                }
            } catch (e) {
                try {
                    const res = await client.sql.query(`SELECT mora, bank FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guild.id]);
                    if (res.rows.length > 0) {
                        safeMora = Number(res.rows[0].mora) || 0;
                        safeBank = Number(res.rows[0].bank) || 0;
                    }
                } catch(err) {}
            }

            if (client.getLevel) {
                let cachedData = await client.getLevel(user.id, guild.id);
                if (cachedData) {
                    cachedData.mora = safeMora;
                    cachedData.bank = safeBank;
                }
            }

            const canvas = Canvas.createCanvas(1000, 400); 
            const context = canvas.getContext('2d');

            const background = await getBackground();
            if (background) {
                context.drawImage(background, 0, 0, canvas.width, canvas.height);
            } else {
                context.fillStyle = '#1A1A1A';
                context.fillRect(0, 0, canvas.width, canvas.height);
            }

            try {
                const avatar = await Canvas.loadImage(user.displayAvatarURL({ extension: 'png', size: 256 }));
                context.save();
                context.beginPath();
                context.arc(165, 200, 65, 0, Math.PI * 2, true); 
                context.closePath();
                context.clip();
                context.drawImage(avatar, 100, 135, 130, 130); 
                context.restore();
            } catch(e) {
                context.fillStyle = "#333333";
                context.beginPath();
                context.arc(165, 200, 65, 0, Math.PI * 2, true); 
                context.fill();
            }

            context.textAlign = 'left';
            context.fillStyle = '#E0B04A'; 
            context.font = 'bold 48px "Cairo", "Sans"'; 

            context.fillText(safeMora.toLocaleString(), 335, 235); 
            context.fillText(safeBank.toLocaleString(), 335, 340); 

            const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'mora-card.png' });

            if (isSlash) {
                await interaction.editReply({ files: [attachment] });
            } else {
                await message.channel.send({ files: [attachment] });
            }

        } catch (error) {
            console.error("Error creating balance card:", error);
            const errorPayload = { content: "حدث خطأ أثناء إنشاء بطاقة الرصيد.", ephemeral: true };
            if (isSlash) {
                if (interaction.deferred || interaction.replied) await interaction.editReply(errorPayload);
                else await interaction.reply(errorPayload);
            } else {
                message.reply(errorPayload.content);
            }
        }
    }
};
