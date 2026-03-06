const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');

// ⬇️ دوال حساب اللفل المصححة ⬇️
function recalculateLevel(totalXP) {
    if (totalXP < 0) totalXP = 0;
    let level = 0; 
    let xp = totalXP;
    let nextXP = 100; 
    while (xp >= nextXP) {
        xp -= nextXP;
        level++;
        nextXP = 5 * (level ** 2) + (50 * level) + 100;
    }
    return { level: level + 1, xp: Math.floor(xp), totalXP: totalXP };
}

function calculateTotalXP(level) {
    if (level <= 1) return 0;
    let totalXP = 0;
    for (let i = 0; i < (level - 1); i++) {
        totalXP += (5 * (i ** 2) + (50 * i) + 100);
    }
    return totalXP;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leveladmin')
        .setDescription('نظام إدارة المستويات (للمشرفين فقط)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('إضافة مستويات لعضو معين')
                .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true))
                .addIntegerOption(option => option.setName('amount').setDescription('عدد المستويات').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('إزالة مستويات من عضو معين')
                .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true))
                .addIntegerOption(option => option.setName('amount').setDescription('عدد المستويات').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('تحديد مستوى معين لعضو')
                .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true))
                .addIntegerOption(option => option.setName('level').setDescription('المستوى الجديد').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('xp')
                .setDescription('إدارة نقاط الخبرة لعضو')
                .addUserOption(option => option.setName('action')
                    .setDescription('العملية')
                    .setRequired(true)
                    .addChoices(
                        { name: 'إضافة (Add)', value: 'add' },
                        { name: 'إزالة (Remove)', value: 'remove' }
                    ))
                .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true))
                .addIntegerOption(option => option.setName('amount').setDescription('الكمية').setRequired(true))
        ),

    name: 'leveladmin',
    aliases: ['la', 'add-level', 'remove-level', 'set-level', 'xp'],
    category: "Leveling",
    description: "إدارة المستويات (مجمع للإدارة)",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const guildId = interactionOrMessage.guild.id;

        const member = isSlash ? interactionOrMessage.member : interactionOrMessage.member;
        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            const err = '🚫 لا تملك صلاحية `ManageGuild` لاستخدام هذا الأمر!';
            return isSlash ? interactionOrMessage.reply({ content: err, ephemeral: true }) : interactionOrMessage.reply(err);
        }

        let subcommand = '';
        let targetUser = null;
        let amount = 0;
        let xpAction = '';

        if (isSlash) {
            subcommand = interactionOrMessage.options.getSubcommand();
            targetUser = interactionOrMessage.options.getMember('user');
            amount = interactionOrMessage.options.getInteger('amount') || interactionOrMessage.options.getInteger('level') || 0;
            xpAction = interactionOrMessage.options.getString('action') || '';
            await interactionOrMessage.deferReply();
        } else {
            const prefixCmd = message.content.split(' ')[0].toLowerCase();
            
            if (prefixCmd.includes('add-level')) subcommand = 'add';
            else if (prefixCmd.includes('remove-level')) subcommand = 'remove';
            else if (prefixCmd.includes('set-level')) subcommand = 'set';
            else if (prefixCmd.includes('xp')) subcommand = 'xp';
            else if (args[0]) subcommand = args[0].toLowerCase();

            targetUser = interactionOrMessage.mentions.members.first() || interactionOrMessage.guild.members.cache.get(args[1] || args[0]);
            
            if (subcommand === 'xp') {
                xpAction = args[0] || '';
                amount = parseInt(args[2]) || parseInt(args[1]) || 0;
            } else {
                amount = parseInt(args[2]) || parseInt(args[1]) || 0;
            }
        }

        const reply = async (payload) => {
            if (isSlash) return interactionOrMessage.editReply(payload);
            return interactionOrMessage.reply(payload);
        };

        if (!targetUser) return reply("❌ يرجى تحديد العضو المطلوب.");
        if (isNaN(amount) || amount <= 0) return reply("❌ يرجى إدخال رقم صحيح أكبر من 0.");

        let score = await client.getLevel(targetUser.id, guildId);
        if (!score) score = { ...client.defaultData, user: targetUser.id, guild: guildId };
        
        score.level = Number(score.level) || 1;
        score.xp = Number(score.xp) || 0;
        score.totalXP = Number(score.totalxp || score.totalXP) || 0;

        const oldLevel = score.level;
        let embed = new EmbedBuilder().setColor("Random");

        try {
            switch (subcommand) {
                // ================= ADD LEVEL =================
                case 'add':
                    const newLevelAdd = score.level + amount;
                    score.level = newLevelAdd;
                    score.xp = 0; 
                    score.totalXP = calculateTotalXP(newLevelAdd);
                    
                    embed.setTitle(`Success!`).setDescription(`Successfully added ${amount} level to ${targetUser}! (New Level: ${score.level})`);
                    break;

                // ================= REMOVE LEVEL =================
                case 'remove':
                    if (score.level <= 1) return reply("❌ هذا المستخدم في المستوى 1 بالفعل.");
                    const newLevelRem = Math.max(1, score.level - amount);
                    const recalculatedRem = recalculateLevel(calculateTotalXP(newLevelRem));
                    
                    score.level = recalculatedRem.level;
                    score.xp = recalculatedRem.xp;
                    score.totalXP = recalculatedRem.totalXP;

                    embed.setTitle(`Success!`).setDescription(`Successfully removed ${amount} level from ${targetUser}! (New Level: ${score.level})`);
                    break;

                // ================= SET LEVEL =================
                case 'set':
                    const recalculatedSet = recalculateLevel(calculateTotalXP(amount));
                    
                    score.level = recalculatedSet.level;
                    score.xp = recalculatedSet.xp;
                    score.totalXP = recalculatedSet.totalXP;

                    embed.setTitle(`Success!`).setDescription(`Successfully set ${targetUser}'s level to ${amount}!`);
                    break;

                // ================= XP MANAGE =================
                case 'xp':
                    if (xpAction !== 'add' && xpAction !== 'remove') return reply("❌ يرجى تحديد العملية (add / remove).");
                    if (xpAction === 'remove' && score.totalXP === 0) return reply("❌ هذا المستخدم ليس لديه خبرة لإزالتها.");

                    let newTotalXpVal = xpAction === 'add' ? score.totalXP + amount : Math.max(0, score.totalXP - amount);
                    const recalculatedXp = recalculateLevel(newTotalXpVal);

                    score.level = recalculatedXp.level;
                    score.xp = recalculatedXp.xp;
                    score.totalXP = recalculatedXp.totalXP;

                    if (xpAction === 'add') {
                        embed.setTitle(`✅ تمت إضافة الخبرة!`).setColor("Green");
                        if (score.level > oldLevel) embed.setDescription(`تمت إضافة ${amount} XP إلى ${targetUser}.\n**🎉 لقد ارتفع مستواه!**\n\n**المستوى الجديد:** ${score.level}\n**الخبرة:** ${score.xp}`);
                        else embed.setDescription(`تمت إضافة ${amount} XP إلى ${targetUser}.\n\n**المستوى:** ${score.level}\n**الخبرة:** ${score.xp}`);
                    } else {
                        embed.setTitle(`🗑️ تمت إزالة الخبرة!`).setColor("Red");
                        if (score.level < oldLevel) embed.setDescription(`تمت إزالة ${amount} XP من ${targetUser}.\n**📉 لقد انخفض مستواه!**\n\n**المستوى الجديد:** ${score.level}\n**الخبرة:** ${score.xp}`);
                        else embed.setDescription(`تمت إزالة ${amount} XP من ${targetUser}.\n\n**المستوى:** ${score.level}\n**الخبرة:** ${score.xp}`);
                    }
                    break;

                default:
                    return reply("❌ أمر غير معروف.");
            }

            await client.setLevel(score);

            if (score.level !== oldLevel) {
                await client.checkAndAwardLevelRoles(targetUser, score.level);
            }

            await reply({ embeds: [embed] });

        } catch (err) {
            console.error("Level Admin Error:", err);
            reply("❌ حدث خطأ داخلي أثناء معالجة الطلب.");
        }
    }
};
