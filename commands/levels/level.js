const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { RankCardBuilder } = require("discord-card-canvas");

function getRandomColorHex() {
    const randomColor = Math.floor(Math.random() * 16777215).toString(16);
    return `#${randomColor.padStart(6, '0')}`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('عرض بطاقة المستوى الخاصة بك أو بعضو آخر')
        .addUserOption(option => option.setName('user').setDescription('العضو المراد عرض رتبته').setRequired(false)),

    name: 'level',
    aliases: ['lvl', 'لفل', 'مستوى', 'رانك', 'rank'],
    category: "Leveling",
    description: "عرض بطاقة المستوى والرتبة",
    cooldown: 5,

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const db = client.sql;
        const guildId = interactionOrMessage.guild.id;

        let targetUser;

        if (isSlash) {
            targetUser = interactionOrMessage.options.getMember('user') || interactionOrMessage.member;
            await interactionOrMessage.deferReply();
        } else {
            targetUser = interactionOrMessage.mentions.members.first() || interactionOrMessage.guild.members.cache.get(args[0]) || interactionOrMessage.member;
        }

        const reply = async (payload) => {
            if (isSlash) return interactionOrMessage.editReply(payload);
            return interactionOrMessage.reply(payload);
        };

        try {
            const score = await client.getLevel(targetUser.id, guildId);

            if (!score) {
                return reply({ content: "❌ هذا العضو ليس لديه رتبة أو مستوى بعد." });
            }

            const totalXp = Number(score.totalXP || score.totalxp) || 0;
            
            // 🔥 التعديل هنا: حماية أسماء الأعمدة بعلامات تنصيص لتناسب السحابة
            const rankRes = await db.query(`SELECT COUNT(*) as count FROM levels WHERE "guild" = $1 AND "totalXP" > $2`, [guildId, totalXp]);
            const rank = Number(rankRes.rows[0].count) + 1;

            const currentLevel = Number(score.level) || 0;
            const currentXp = Number(score.xp) || 0;
            const requiredXP = 5 * (currentLevel ** 2) + (50 * currentLevel) + 100;

            const randomAccentColor = getRandomColorHex(); 
            const hardcodedBlue = "#0CA7FF"; 
            const backgroundColor = "#070d19";
            const userStatus = targetUser.presence ? targetUser.presence.status : "offline";

            const card = new RankCardBuilder({
                currentLvl: currentLevel,
                currentRank: rank,
                currentXP: currentXp, 
                requiredXP: requiredXP,
                backgroundColor: { background: backgroundColor, bubbles: randomAccentColor }, 
                avatarImgURL: targetUser.user.displayAvatarURL({ extension: 'png' }),
                nicknameText: { content: targetUser.user.tag, font: 'Cairo', color: hardcodedBlue },
                userStatus: userStatus,
                progressbarColor: hardcodedBlue,
                levelText: { font: 'Cairo', color: hardcodedBlue },
                rankText: { font: 'Cairo', color: hardcodedBlue },
                xpText: { font: 'Cairo', color: hardcodedBlue },
            });

            const canvasRank = await card.build();
            const attachment = new AttachmentBuilder(canvasRank.toBuffer(), { name: 'rank.png' });
            
            await reply({ files: [attachment] });

        } catch (error) {
            console.error("Error creating rank card:", error);
            await reply({ content: "❌ حدث خطأ أثناء إنشاء بطاقة المستوى." });
        }
    }
};
