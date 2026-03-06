const { SlashCommandBuilder, PermissionsBitField, AttachmentBuilder } = require('discord.js');
const { RankCardBuilder } = require("discord-card-canvas");

function getRandomColorHex() {
    const randomColor = Math.floor(Math.random() * 16777215).toString(16);
    return `#${randomColor.padStart(6, '0')}`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('نظام إدارة المستويات والرتب')
        .addSubcommand(subcommand =>
            subcommand
                .setName('rank')
                .setDescription('عرض بطاقة المستوى الخاصة بك أو بعضو آخر')
                .addUserOption(option => option.setName('user').setDescription('العضو المراد عرض رتبته').setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('إضافة مستويات لعضو معين (للمشرفين)')
                .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true))
                .addIntegerOption(option => option.setName('amount').setDescription('عدد المستويات').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('إزالة مستويات من عضو معين (للمشرفين)')
                .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true))
                .addIntegerOption(option => option.setName('amount').setDescription('عدد المستويات').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('تحديد مستوى معين لعضو (للمشرفين)')
                .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true))
                .addIntegerOption(option => option.setName('level').setDescription('المستوى الجديد').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('xp')
                .setDescription('إدارة نقاط الخبرة لعضو (للمشرفين)')
                .addUserOption(option => option.setName('action')
                    .setDescription('العملية')
                    .setRequired(true)
                    .addChoices(
                        { name: 'إضافة (Add)', value: 'add' },
                        { name: 'إزالة (Remove)', value: 'remove' },
                        { name: 'تعيين (Set)', value: 'set' }
                    ))
                .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true))
                .addIntegerOption(option => option.setName('amount').setDescription('الكمية').setRequired(true))
        ),

    name: 'level',
    aliases: ['lvl', 'لفل', 'مستوى', 'رانك', 'rank'],
    category: "Leveling",
    description: "نظام إدارة المستويات (مجمع)",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const db = client.sql;
        const guildId = interactionOrMessage.guild.id;
        
        let subcommand = '';
        let targetUser = null;
        let amount = 0;
        let xpAction = '';

        if (isSlash) {
            subcommand = interactionOrMessage.options.getSubcommand();
            targetUser = interactionOrMessage.options.getMember('user') || interactionOrMessage.member;
            amount = interactionOrMessage.options.getInteger('amount') || interactionOrMessage.options.getInteger('level') || 0;
            xpAction = interactionOrMessage.options.getString('action') || '';
            await interactionOrMessage.deferReply();
        } else {
            const validSubcommands = ['add', 'remove', 'set', 'xp', 'rank'];
            
            if (args[0] && validSubcommands.includes(args[0].toLowerCase())) {
                subcommand = args[0].toLowerCase();
                targetUser = interactionOrMessage.mentions.members.first() || interactionOrMessage.guild.members.cache.get(args[1]);
                amount = parseInt(args[2]) || 0;
                xpAction = args[1] || ''; 
            } 
            else {
                subcommand = 'rank';
                targetUser = interactionOrMessage.mentions.members.first() || interactionOrMessage.guild.members.cache.get(args[0]) || interactionOrMessage.member;
            }
        }

        const reply = async (payload) => {
            if (isSlash) return interactionOrMessage.editReply(payload);
            return interactionOrMessage.reply(payload);
        };

        if (['add', 'remove', 'set', 'xp'].includes(subcommand)) {
            const member = isSlash ? interactionOrMessage.member : interactionOrMessage.member;
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return reply({ content: '🚫 لا تملك صلاحية لاستخدام هذا الأمر الإداري!', ephemeral: true });
            }
        }

        switch (subcommand) {
            case 'rank':
                try {
                    const score = await client.getLevel(targetUser.id, guildId);

                    if (!score) {
                        return reply({ content: "This user is not ranked yet." });
                    }

                    const totalXp = Number(score.totalxp || score.totalXP) || 0;
                    const rankRes = await db.query("SELECT COUNT(*) as count FROM levels WHERE guild = $1 AND totalXP > $2", [guildId, totalXp]);
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
                    await reply({ content: "There was an error generating the rank card." });
                }
                break;

            case 'add':
                break;

            case 'remove':
                break;

            case 'set':
                break;

            case 'xp':
                break;
        }
    }
};
