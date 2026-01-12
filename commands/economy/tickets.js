const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const path = require('path');

// ✅ المسار الصحيح للأدوات
const { manageTickets } = require(path.join(process.cwd(), 'handlers/dungeon/utils.js'));

module.exports = {
    aliases: ['ticket', 'تذاكري', 'تذاكر', 'تذكرة'],

    data: new SlashCommandBuilder()
        .setName('tickets')
        .setDescription('عرض عدد تذاكر الدانجون المتوفرة')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('الشخص الذي تريد رؤية تذاكره')
                .setRequired(false)
        ),

    async execute(interaction, sql) {
        // 🔥 تصحيح الخطأ: تحديد صاحب الأمر سواء كان رسالة أو سلاش
        // interaction.user (للسلاش) || interaction.author (للرسائل)
        const commandUser = interaction.user || interaction.author;
        let targetUser = commandUser;

        // 1. تحديد الهدف (Target)
        if (interaction.isChatInputCommand && interaction.isChatInputCommand()) {
            // حالة السلاش: نأخذ الخيار أو الشخص نفسه
            targetUser = interaction.options.getUser('user') || commandUser;
        } 
        else if (interaction.mentions && interaction.mentions.users.size > 0) {
            // حالة الرسالة: نأخذ أول منشن
            targetUser = interaction.mentions.users.first();
        }

        // 2. جلب بيانات التذاكر
        const ticketData = manageTickets(targetUser.id, interaction.guild.id, sql, 'check');

        // 3. حساب موعد التجديد (الساعة 12:00 ص بتوقيت السعودية)
        const now = new Date();
        const nextReset = new Date(now);
        nextReset.setUTCHours(21, 0, 0, 0); // 21:00 UTC = 00:00 KSA

        if (now > nextReset) {
            nextReset.setDate(nextReset.getDate() + 1);
        }

        const timestamp = Math.floor(nextReset.getTime() / 1000);

        // 4. تجهيز النصوص
        const titleText = targetUser.id === commandUser.id ? 'عـدد تـذاكـرك' : `عـدد تـذاكـر ${targetUser.username}`;

        // 5. تصميم الإيمبد
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
