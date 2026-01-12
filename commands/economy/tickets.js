const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const path = require('path');

// استدعاء دالة إدارة التذاكر
const { manageTickets } = require(path.join(process.cwd(), 'dungeon', 'utils.js'));

module.exports = {
    // الاختصارات (تعمل مع البادئة Prefix)
    aliases: ['ticket', 'تذاكري','تذاكر', 'تذكرة'],

    data: new SlashCommandBuilder()
        .setName('tickets')
        .setDescription('عرض عدد تذاكر الدانجون المتوفرة')
        // ✅ إضافة خيار لتحديد مستخدم آخر (اختياري)
        .addUserOption(option => 
            option.setName('user')
                .setDescription('الشخص الذي تريد رؤية تذاكره')
                .setRequired(false)
        ),

    async execute(interaction, sql) {
        // ✅ تحديد الهدف: هل هو الشخص المذكور أم صاحب الأمر؟
        let targetUser = interaction.user;

        // التحقق مما إذا كان الأمر عبر السلاش Slash Command
        if (interaction.isChatInputCommand && interaction.isChatInputCommand()) {
            targetUser = interaction.options.getUser('user') || interaction.user;
        } 
        // التحقق مما إذا كان الأمر عبر الرسائل العادية (Prefix) وفيه منشن
        else if (interaction.mentions && interaction.mentions.users.size > 0) {
            targetUser = interaction.mentions.users.first();
        }

        // 1. جلب بيانات التذاكر للشخص المحدد
        const ticketData = manageTickets(targetUser.id, interaction.guild.id, sql, 'check');

        // 2. حساب موعد التجديد (الساعة 12:00 ص بتوقيت السعودية)
        const now = new Date();
        const nextReset = new Date(now);
        nextReset.setUTCHours(21, 0, 0, 0); // 21:00 UTC = 00:00 KSA

        if (now > nextReset) {
            nextReset.setDate(nextReset.getDate() + 1);
        }

        const timestamp = Math.floor(nextReset.getTime() / 1000);

        // 3. تجهيز النصوص بناءً على الشخص
        const titleText = targetUser.id === interaction.user.id ? 'عـدد تـذاكـرك' : `عـدد تـذاكـر ${targetUser.username}`;

        // 4. تصميم الإيمبد
        const embed = new EmbedBuilder()
            .setTitle('✥ تـذاكـر الدانـجـون')
            .setColor('#E8271C') 
            .setThumbnail('https://i.postimg.cc/0jksK7N9/duti.png')
            .setDescription(
                `✶ ${titleText} ايـها المحـارب هـو **(${ticketData.tickets}/${ticketData.max})**\n\n` +
                `✶ كلـمـا ارتقـيـت بالامبراطـوريـة زادت تـذاكـرك 🎫\n\n` +
                `✶ تـتجـدد التذاكـر: <t:${timestamp}:R>`
            )
            .setFooter({ text: targetUser.username, iconURL: targetUser.displayAvatarURL() });

        await interaction.reply({ embeds: [embed] });
    },
};
