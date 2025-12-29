const { PermissionsBitField, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
    name: 'timeout',
    description: 'إسكات عضو (تلقائي 30 دقيقة إذا لم يحدد وقت)',
    aliases: ['اوت', 'تايم', 'اسكات', 'انطم', 'اخرس'],
    category: 'Admin',
    usage: 'timeout <@user> [time] [reason]',
    
    async execute(message, args) {
        const sql = message.client.sql;

        // 1. التحقق من الصلاحيات (تجاهل تام إذا لم يملك الصلاحية)
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;

        // 2. جلب العضو
        const targetArg = args[0];
        if (!targetArg) return message.reply('❓ **منشن العضو.**');
        
        let targetMember;
        try {
            targetMember = message.mentions.members.first() || await message.guild.members.fetch(targetArg);
        } catch (err) {
            return message.reply('❌ **لم يتم العثور على العضو.**');
        }

        // 3. التحقق من الرتب
        if (targetMember.user.bot) return message.reply('❌ **لا يمكنني إسكات البوتات.**');
        if (targetMember.id === message.author.id) return message.reply('❌ **لا يمكنك إسكات نفسك.**');
        if (targetMember.id === message.guild.ownerId) return message.reply('❌ **لا يمكنك إسكات المالك.**');
        
        if (message.author.id !== message.guild.ownerId && targetMember.roles.highest.position >= message.member.roles.highest.position) {
            return message.reply('❌ **لا يمكنك إسكات شخص رتبته أعلى منك أو مساوية لك.**');
        }
        if (!targetMember.moderatable) {
            return message.reply('❌ **لا يمكنني إسكات هذا العضو (رتبته أعلى مني).**');
        }

        // 4. معالجة الوقت والسبب (الذكاء في التحديد)
        let timeArg = args[1];
        let reason;
        let finalTimeMs;

        // دالة للتحقق هل النص هو وقت أم لا
        const isTimeFormat = (str) => /^(\d+)(s|m|h|d|w)$/.test(str);

        if (timeArg && isTimeFormat(timeArg)) {
            // المستخدم حدد وقت صحيح في الخانة الثانية
            finalTimeMs = parseDuration(timeArg);
            reason = args.slice(2).join(" ") || "مخالفة القوانين";
        } else {
            // المستخدم لم يحدد وقت (أو كتب السبب مباشرة مكان الوقت)
            timeArg = '30m'; // القيمة الافتراضية
            finalTimeMs = parseDuration(timeArg);
            // إذا كان الخانة الثانية موجودة بس مو وقت، نعتبرها بداية السبب
            reason = args.slice(1).join(" ") || "مخالفة القوانين";
        }

        if (!finalTimeMs || finalTimeMs > 28 * 24 * 60 * 60 * 1000) { 
            return message.reply('❌ **الوقت غير صحيح أو طويل جداً (الحد الأقصى 28 يوم).**');
        }

        // تحويل الوقت للعربية (للعرض في الخاص واللوق)
        let arabicTime = timeArg
            .replace('s', ' ثانية')
            .replace('m', ' دقيقة')
            .replace('h', ' ساعة')
            .replace('d', ' يوم')
            .replace('w', ' اسبوع');

        // 5. تجهيز رقم القضية
        let lastCase = sql.prepare("SELECT caseID FROM mod_cases WHERE guildID = ? ORDER BY caseID DESC LIMIT 1").get(message.guild.id);
        let newCaseID = lastCase ? lastCase.caseID + 1 : 1;
        const uniqueID = `${message.guild.id}-${newCaseID}`;

        // 6. إشعار الخاص (بالتفاصيل)
        try {
            const dmEmbed = new EmbedBuilder()
                .setTitle('✥ تـم اسـكـاتـك')
                .setColor('Random')
                .addFields(
                    { name: '✶ السبب:', value: reason, inline: false },
                    { name: '✶ المـدة:', value: arabicTime, inline: false },
                    { name: '✶ السيرفر:', value: message.guild.name, inline: false },
                    { name: '✶ بواسـطـة:', value: `<@${message.author.id}>`, inline: false }
                )
                .setImage('https://tenor.com/view/amagami-amagami-sister-tying-the-knot-with-an-amagami-sister-mahiru-anekouji-gif-17869569217293962202');

            await targetMember.send({ embeds: [dmEmbed] });
        } catch (e) { }

        // 7. تنفيذ التايم أوت
        try {
            await targetMember.timeout(finalTimeMs, `[Timeout by ${message.author.tag}] Reason: ${reason}`);
        } catch (err) {
            return message.reply('❌ **حدث خطأ غير متوقع أثناء الإسكات.**');
        }

        // 8. الحفظ في الداتابيس
        sql.prepare(`INSERT INTO mod_cases (id, guildID, caseID, type, targetID, moderatorID, reason, timestamp) 
                     VALUES (?, ?, ?, 'TIMEOUT', ?, ?, ?, ?)`)
            .run(uniqueID, message.guild.id, newCaseID, targetMember.id, message.author.id, reason, Date.now());

        // 9. الرد في الشات (الشكل الجديد المطلوب)
        const chatEmbed = new EmbedBuilder()
            .setDescription('✶ تـم الاسـكـات ...')
            .setColor('Random')
            .setImage('https://tenor.com/view/amagami-amagami-sister-tying-the-knot-with-an-amagami-sister-mahiru-anekouji-gif-17869569217293962202');
        
        message.reply({ embeds: [chatEmbed], allowedMentions: { repliedUser: false } });

        // 10. اللوق
        sendModLog(message, targetMember, 'TIMEOUT', reason, newCaseID, arabicTime);
    }
};

// دالة تحويل النص إلى وقت
function parseDuration(str) {
    if (!str) return null;
    const match = str.match(/^(\d+)(s|m|h|d|w)$/);
    if (!match) return null;
    const value = parseInt(match[1]);
    const unit = match[2];
    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        case 'w': return value * 7 * 24 * 60 * 60 * 1000;
        default: return null;
    }
}

// دالة اللوق
function sendModLog(message, targetMember, type, reason, caseID, duration = null) {
    const sql = message.client.sql;
    const settings = sql.prepare("SELECT modLogChannelID FROM settings WHERE guild = ?").get(message.guild.id);
    if (settings && settings.modLogChannelID) {
        const logChannel = message.guild.channels.cache.get(settings.modLogChannelID);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle(`🟡 New Timeout | Case #${caseID}`)
                .setColor(Colors.Orange)
                .setThumbnail(targetMember.user.displayAvatarURL())
                .addFields(
                    { name: '👤 العضو', value: `${targetMember.user.tag} (${targetMember.id})`, inline: true },
                    { name: '👮 المشرف', value: `${message.author.tag} (${message.author.id})`, inline: true },
                    { name: '⏱️ المدة', value: duration || 'N/A', inline: true },
                    { name: '📝 السبب', value: reason },
                    { name: '⏰ الوقت', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
                )
                .setFooter({ text: `EMorax Security System` });
            logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
    }
}
