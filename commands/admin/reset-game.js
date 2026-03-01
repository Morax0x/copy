const { SlashCommandBuilder, PermissionsBitField } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('فك-التعليق')
        .setDescription('فك التعليق عن لاعب عالق في لعبة (أو الجميع).')
        .addUserOption(option => 
            option.setName('المستخدم')
                .setDescription('الشخص الذي تريد فك تعليقه (اتركه فارغاً لفك تعليقك أنت)')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('الكل')
                .setDescription('هل تريد تصفير قائمة اللاعبين بالكامل؟ (تحذير: سيوقف ألعاب الجميع)')
                .setRequired(false)
        ),

    name: 'reset-game',
    aliases: ['فك', 'unstuck', 'resetgame'],
    category: "Admin",
    description: "فك التعليق عن اللاعبين العالقين في الألعاب.",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const authorId = isSlash ? interactionOrMessage.user.id : interactionOrMessage.author.id;

        // التأكد من وجود القوائم لتجنب الأخطاء
        if (!client.activePlayers) client.activePlayers = new Set();
        if (!client.activeGames) client.activeGames = new Set();
        if (!client.raceTimestamps) client.raceTimestamps = new Map();

        const reply = async (content) => {
            if (isSlash) return interactionOrMessage.reply({ content, ephemeral: true });
            return interactionOrMessage.reply(content);
        };

        // التحقق من الصلاحيات (أدمن فقط)
        const member = isSlash ? interactionOrMessage.member : interactionOrMessage.member;
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator) && authorId !== "1145327691772481577") { // ضع آيديك هنا
             return reply("❌ هذا الأمر للمشرفين فقط.");
        }

        let targetUser;
        let resetAll = false;

        if (isSlash) {
            targetUser = interactionOrMessage.options.getUser('المستخدم') || interactionOrMessage.user;
            resetAll = interactionOrMessage.options.getBoolean('الكل') || false;
        } else {
            if (args[0] === 'all' || args[0] === 'الكل') resetAll = true;
            else targetUser = interactionOrMessage.mentions.users.first() || interactionOrMessage.author;
        }

        if (resetAll) {
            // تصفير كامل (الحل الجذري)
            const count = client.activePlayers.size;
            client.activePlayers.clear();
            client.activeGames.clear();
            client.raceTimestamps.clear();
            if (client.marketLocks) client.marketLocks.clear(); // فك قفل السوق أيضاً
            
            return reply(`✅ **تمت عملية الطوارئ!**\nتم تحرير جميع اللاعبين (${count}) وتصفير الألعاب العالقة وقفل السوق.`);
        }

        // فك تعليق شخص محدد
        if (client.activePlayers.has(targetUser.id)) {
            client.activePlayers.delete(targetUser.id);
            client.raceTimestamps.delete(targetUser.id);
            return reply(`✅ **تم!** تم فك التعليق عن ${targetUser} بنجاح. يمكنه اللعب الآن.`);
        } else {
            return reply(`ℹ️ اللاعب ${targetUser} ليس عالقاً (غير موجود في القائمة النشطة).`);
        }
    }
};
