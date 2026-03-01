const { EmbedBuilder, PermissionsBitField, SlashCommandBuilder } = require("discord.js");

// --- ( ⬇️ الدوال الحسابية كما هي لم تتغير ⬇️ ) ---
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
// --- ( ⬆️ نهاية الدوال ⬆️ ) ---

module.exports = {
    // 1. إعداد أمر السلاش (Slash Command Setup)
    data: new SlashCommandBuilder()
        .setName('set-level')
        .setDescription('Set user Level and XP manually')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user to set level for')
                .setRequired(true))
        .addIntegerOption(option => 
            option.setName('level')
                .setDescription('The new level (1 or higher)')
                .setRequired(true)),

    name: 'set-level',
    aliases: ['levelset'],
    category: "Leveling",
    description: "Set user Level and XP",
    cooldown: 3,

    async execute(messageOrInteraction, args) {
        
        // تحديد هل الأمر رسالة عادية أم سلاش
        const isSlash = messageOrInteraction.isChatInputCommand && messageOrInteraction.isChatInputCommand();
        let message, interaction;
        let user, levelArgs;
        let memberExecutor; // الشخص الذي نفذ الأمر

        if (isSlash) {
            interaction = messageOrInteraction;
            memberExecutor = interaction.member;
            
            // جلب البيانات من السلاش
            user = interaction.options.getMember('user');
            levelArgs = interaction.options.getInteger('level');
            
            await interaction.deferReply(); // انتظار عشان ما يفصل
        } else {
            message = messageOrInteraction;
            memberExecutor = message.member;

            // 1. محاولة جلب العضو (منشن أو ID)
            // أولاً: المنشن
            user = message.mentions.members.first();
            
            // ثانياً: إذا مافي منشن، نجرب الـ ID
            if (!user && args[0]) {
                try {
                    // fetch يجيب العضو حتى لو مو بالكاش
                    user = await message.guild.members.fetch(args[0]).catch(() => null);
                } catch (e) {
                    user = null;
                }
            }

            levelArgs = parseInt(args[1]);
        }

        // التحقق من الصلاحيات
        if (!memberExecutor.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            const content = `You do not have permission to use this command!`;
            return isSlash ? interaction.editReply(content) : message.reply(content);
        }

        // التحقق من العضو
        if (!user) {
            const content = `Please mention a user or provide a valid User ID!`;
            return isSlash ? interaction.editReply(content) : message.reply(content);
        }

        // التحقق من الرقم
        if (isNaN(levelArgs) || levelArgs < 1) {
            const content = `Please provide a valid number (1 or higher)!`;
            return isSlash ? interaction.editReply(content) : message.reply(content);
        }

        // --- بدء التنفيذ ---
        const client = messageOrInteraction.client;
        const getScore = client.getLevel;
        const setScore = client.setLevel;

        let score = getScore.get(user.id, messageOrInteraction.guild.id);

        // إنشاء داتا جديدة لو ما كان عنده
        score = {
            ...client.defaultData,
            ...score,
            user: user.id,
            guild: messageOrInteraction.guild.id
        };

        // الحسابات
        const newTotalXP = calculateTotalXP(levelArgs);
        const recalculated = recalculateLevel(newTotalXP);

        score.level = recalculated.level;
        score.xp = recalculated.xp;
        score.totalXP = recalculated.totalXP;

        // 1. حفظ البيانات
        setScore.run(score);

        // 2. إعطاء الرتب
        await client.checkAndAwardLevelRoles(user, score.level);

        // الرد النهائي
        let embed = new EmbedBuilder()
            .setTitle(`Success!`)
            .setDescription(`Successfully set ${user.toString()}'s level to ${levelArgs}!`)
            .setColor("Random");

        if (isSlash) {
            return interaction.editReply({ embeds: [embed] });
        } else {
            return message.channel.send({ embeds: [embed] });
        }
    }
}
