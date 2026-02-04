const { EmbedBuilder, Colors } = require('discord.js');

const EMOJI_MORA = '<:mora:1435647151349698621>'; // عدل الايموجي
const LOG_THRESHOLD = 10000; // الحد الأدنى لإرسال اللوغ (10 آلاف)
const HUGE_THRESHOLD = 1000000; // حد الخطر (مليون) -> يمنشنك

async function logTransaction(client, userID, guildID, amount, source) {
    if (amount < LOG_THRESHOLD) return; // تجاهل المبالغ الصغيرة

    const sql = client.sql;
    if (!sql.open) return;

    // جلب إعدادات القناة
    const settings = sql.prepare("SELECT transactionLogChannelID FROM settings WHERE guild = ?").get(guildID);
    if (!settings || !settings.transactionLogChannelID) return;

    const channel = client.channels.cache.get(settings.transactionLogChannelID);
    if (!channel) return;

    // جلب بيانات اللاعب الحالية
    const userData = sql.prepare("SELECT mora, bank FROM levels WHERE user = ? AND guild = ?").get(userID, guildID);
    const totalBalance = (userData?.mora || 0) + (userData?.bank || 0);

    // جلب معلومات العضو للصورة والاسم
    const guild = client.guilds.cache.get(guildID);
    const member = await guild.members.fetch(userID).catch(() => null);
    const userTag = member ? member.user.tag : "Unknown User";
    const userAvatar = member ? member.user.displayAvatarURL() : null;

    // تحديد لون الخطورة
    let embedColor = Colors.Orange;
    let contentMsg = "";

    if (amount >= HUGE_THRESHOLD) {
        embedColor = Colors.DarkRed;
        contentMsg = `🚨 **تنبيه أمني:** مبلغ ضخم جداً! <@${guild.ownerId}>`; // منشن للأونر
    }

    const logEmbed = new EmbedBuilder()
        .setTitle('💰 عملية مالية كبيرة')
        .setAuthor({ name: userTag, iconURL: userAvatar })
        .setDescription(`تم اكتشاف عملية كسب مبلغ كبير، يرجى المراجعة.`)
        .addFields([
            { name: '👤 المستفيد', value: `<@${userID}> (\`${userID}\`)`, inline: true },
            { name: '📥 المبلغ المكتسب', value: `**+${amount.toLocaleString()}** ${EMOJI_MORA}`, inline: true },
            { name: '🧾 المصدر (السبب)', value: `\`${source}\``, inline: true }, // أهم خانة
            { name: '💰 الرصيد الحالي', value: `**${totalBalance.toLocaleString()}** ${EMOJI_MORA}`, inline: false }
        ])
        .setColor(embedColor)
        .setFooter({ text: "نظام حماية الاقتصاد 🛡️" })
        .setTimestamp();

    await channel.send({ content: contentMsg, embeds: [logEmbed] });
}

module.exports = { logTransaction };
