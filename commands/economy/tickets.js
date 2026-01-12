const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const path = require('path');

// استدعاء دالة إدارة التذاكر
const { manageTickets } = require(path.join(process.cwd(), 'handlers/dungeon/utils.js'));

module.exports = {
    // الاختصارات (للرسائل العادية)
    aliases: ['ticket', 'تذاكري', 'تذاكر', 'تذكرة'],

    data: new SlashCommandBuilder()
        .setName('tickets') // ⚠️ إجباري يكون إنجليزي هنا (قوانين ديسكورد)
        .setNameLocalizations({ ar: 'تذاكر' }) // ✅ هنا يظهر بالعربي للمستخدمين
        .setDescription('عرض عدد تذاكر الدانجون المتوفرة')
        .setDescriptionLocalizations({ ar: 'عرض عدد تذاكر الدانجون وموعد التجديد' })
        .addUserOption(option => 
            option.setName('user')
                .setNameLocalizations({ ar: 'المستخدم' }) // اسم الخيار بالعربي
                .setDescription('الشخص الذي تريد رؤية تذاكره')
                .setRequired(false)
        ),

    // لا نعتمد على تمرير sql كمتغير ثاني لأنه يسبب مشاكل، نأخذه من client
    async execute(interaction) { 
        // 🔥 الحل الجذري لمشكلة SQL: جلب قاعدة البيانات من الكلاينت مباشرة
        const client = interaction.client;
        const sql = client.sql; 

        if (!sql) {
            console.error("❌ Error: SQL Database is not attached to Client.");
            return;
        }

        // تحديد صاحب الأمر (سواء كان رسالة أو سلاش)
        const commandUser = interaction.user || interaction.author;
        let targetUser = commandUser;

        // 1. تحديد الهدف (Target)
        if (interaction.isChatInputCommand && interaction.isChatInputCommand()) {
            targetUser = interaction.options.getUser('user') || commandUser;
        } 
        else if (interaction.mentions && interaction.mentions.users.size > 0) {
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
