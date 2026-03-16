const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors } = require('discord.js');

const SUGGESTION_COOLDOWN = new Map();

async function handleNewSuggestion(message, client, db) {
    // 1. فحص الشروط الأساسية (منع البوتات، السبام، والرسائل القصيرة)
    if (message.author.bot) return;

    const content = message.content.trim();
    if (content.length < 10) {
        message.delete().catch(() => {});
        return message.author.send("❌ **عذراً،** يجب أن يكون الاقتراح واضحاً ويحتوي على الأقل 10 أحرف!").catch(() => {});
    }

    // 2. نظام التهدئة (اقتراح كل 15 دقيقة) لمنع السبام
    const cooldownTime = 15 * 60 * 1000; // 15 دقيقة
    const now = Date.now();
    const userCooldown = SUGGESTION_COOLDOWN.get(message.author.id);

    if (userCooldown && now < userCooldown) {
        message.delete().catch(() => {});
        const minutesLeft = Math.ceil((userCooldown - now) / 60000);
        return message.author.send(`⏱️ **مهلاً!** لا يمكنك إرسال اقتراح جديد الآن. يرجى الانتظار \`${minutesLeft}\` دقيقة.`).catch(() => {});
    }
    
    SUGGESTION_COOLDOWN.set(message.author.id, now + cooldownTime);

    // 3. تجهيز الجداول إذا لم تكن موجودة (التأسيس التلقائي)
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS suggestions (
                "messageID" TEXT PRIMARY KEY,
                "guildID" TEXT,
                "userID" TEXT,
                "content" TEXT,
                "status" TEXT DEFAULT 'pending',
                "upvotes" INTEGER DEFAULT 0,
                "downvotes" INTEGER DEFAULT 0,
                "createdAt" BIGINT
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS suggestion_votes (
                "messageID" TEXT,
                "userID" TEXT,
                "voteType" TEXT,
                PRIMARY KEY ("messageID", "userID")
            )
        `);
    } catch (e) {
        console.error("Error creating suggestions table:", e);
    }

    // 4. بناء الإيمبد الفخم
    const embed = new EmbedBuilder()
        .setAuthor({ name: `💡 اقتراح من: ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
        .setDescription(`>>> ${content}`)
        .setColor('#F1C40F') // أصفر كحالة افتراضية (قيد المراجعة)
        .setThumbnail('https://i.postimg.cc/mgsVcw27/1234.png') // أيقونة لمبة مضيئة
        .addFields(
            { name: '📊 التصويت', value: '👍 مؤيد: `0`\n👎 معارض: `0`', inline: true },
            { name: '📌 الحالة', value: '🟡 قيد المراجعة', inline: true }
        )
        .setTimestamp()
        .setFooter({ text: `معرف العضو: ${message.author.id}` });

    if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        if (attachment.contentType && attachment.contentType.startsWith('image/')) {
            embed.setImage(attachment.url);
        }
    }

    // 5. بناء الأزرار (أؤيد، أرفض، الإدارة)
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('sugg_upvote').setLabel('أؤيد').setStyle(ButtonStyle.Success).setEmoji('👍'),
        new ButtonBuilder().setCustomId('sugg_downvote').setLabel('أرفض').setStyle(ButtonStyle.Danger).setEmoji('👎'),
        new ButtonBuilder().setCustomId('sugg_admin').setLabel('إدارة الاقتراح').setStyle(ButtonStyle.Secondary).setEmoji('⚙️')
    );

    // 6. إرسال الاقتراح كرسالة جديدة للبوت، ثم حذف رسالة العضو
    try {
        const suggestionMsg = await message.channel.send({ embeds: [embed], components: [row] });
        message.delete().catch(() => {});

        // 7. حفظ الاقتراح في قاعدة البيانات
        await db.query(`
            INSERT INTO suggestions ("messageID", "guildID", "userID", "content", "status", "upvotes", "downvotes", "createdAt")
            VALUES ($1, $2, $3, $4, 'pending', 0, 0, $5)
        `, [suggestionMsg.id, message.guild.id, message.author.id, content, now]);

        // 8. إنشاء الثريد للمناقشة
        await suggestionMsg.startThread({
            name: `💬 مناقشة اقتراح ${message.author.username}`,
            autoArchiveDuration: 1440, // 24 ساعة
            reason: 'نقاش اقتراح جديد'
        });

    } catch (err) {
        console.error("Error sending/saving suggestion:", err);
    }
}

// ==============================================
// 🔘 نظام التعامل مع ضغطات الأزرار
// ==============================================
async function handleSuggestionButtons(interaction, client, db) {
    if (!interaction.isButton() || !interaction.customId.startsWith('sugg_')) return;

    const messageId = interaction.message.id;
    const userId = interaction.user.id;

    // استخراج بيانات الاقتراح من قاعدة البيانات
    let suggRes;
    try { suggRes = await db.query(`SELECT * FROM suggestions WHERE "messageID" = $1`, [messageId]); }
    catch (e) { return; }
    
    const suggData = suggRes.rows[0];
    if (!suggData) return interaction.reply({ content: '❌ هذا الاقتراح غير مسجل أو محذوف.', flags: [64] }); // 64 = Ephemeral

    // 🔴 1. إذا كان زر "إدارة الاقتراح" (خاص بالإدارة)
    if (interaction.customId === 'sugg_admin') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '❌ هذا الزر مخصص لإدارة السيرفر فقط!', flags: [64] });
        }

        const adminRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('sugg_status_accept').setLabel('قبول/تنفيذ').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('sugg_status_reject').setLabel('رفض').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('sugg_status_review').setLabel('قيد العمل').setStyle(ButtonStyle.Primary)
        );

        return interaction.reply({ content: '⚙️ **تغيير حالة الاقتراح:**', components: [adminRow], flags: [64] });
    }

    // 🟢 2. إذا كان زر التصويت (أؤيد / أرفض)
    if (interaction.customId === 'sugg_upvote' || interaction.customId === 'sugg_downvote') {
        const voteType = interaction.customId === 'sugg_upvote' ? 'up' : 'down';

        // منع العضو من التصويت على اقتراحه الشخصي
        if (suggData.userID === userId || suggData.userid === userId) {
            return interaction.reply({ content: '❌ لا يمكنك التصويت على اقتراحك الخاص!', flags: [64] });
        }

        let userVoteRes;
        try { userVoteRes = await db.query(`SELECT "voteType" FROM suggestion_votes WHERE "messageID" = $1 AND "userID" = $2`, [messageId, userId]); }
        catch(e) { userVoteRes = { rows: [] }; }
        
        const userVote = userVoteRes.rows[0];

        if (userVote) {
            const oldVoteType = userVote.voteType || userVote.votetype;
            if (oldVoteType === voteType) {
                return interaction.reply({ content: '⚠️ لقد قمت بالتصويت بهذا الخيار مسبقاً!', flags: [64] });
            }

            // إذا غير صوته، نحدث العدد في الداتابيس
            if (voteType === 'up') {
                await db.query(`UPDATE suggestions SET "upvotes" = "upvotes" + 1, "downvotes" = "downvotes" - 1 WHERE "messageID" = $1`, [messageId]);
            } else {
                await db.query(`UPDATE suggestions SET "upvotes" = "upvotes" - 1, "downvotes" = "downvotes" + 1 WHERE "messageID" = $1`, [messageId]);
            }
            await db.query(`UPDATE suggestion_votes SET "voteType" = $1 WHERE "messageID" = $2 AND "userID" = $3`, [voteType, messageId, userId]);
            await interaction.reply({ content: '✅ تم تغيير تصويتك بنجاح.', flags: [64] });

        } else {
            // تصويت لأول مرة
            if (voteType === 'up') {
                await db.query(`UPDATE suggestions SET "upvotes" = "upvotes" + 1 WHERE "messageID" = $1`, [messageId]);
            } else {
                await db.query(`UPDATE suggestions SET "downvotes" = "downvotes" + 1 WHERE "messageID" = $1`, [messageId]);
            }
            await db.query(`INSERT INTO suggestion_votes ("messageID", "userID", "voteType") VALUES ($1, $2, $3)`, [messageId, userId, voteType]);
            await interaction.reply({ content: '✅ تم تسجيل تصويتك.', flags: [64] });
        }

        // تحديث الإيمبد الأصلي بالنتائج الجديدة
        const updatedSuggRes = await db.query(`SELECT "upvotes", "downvotes", "status" FROM suggestions WHERE "messageID" = $1`, [messageId]);
        const newStats = updatedSuggRes.rows[0];

        const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
        const statusField = originalEmbed.data.fields[1].value; // نحتفظ بحالة الاقتراح الحالية
        
        originalEmbed.setFields(
            { name: '📊 التصويت', value: `👍 مؤيد: \`${newStats.upvotes}\`\n👎 معارض: \`${newStats.downvotes}\``, inline: true },
            { name: '📌 الحالة', value: statusField, inline: true }
        );

        await interaction.message.edit({ embeds: [originalEmbed] });
    }

    // 🟡 3. إذا كان زر التحكم الإداري الداخلي (قبول / رفض / قيد العمل)
    if (interaction.customId.startsWith('sugg_status_')) {
        const action = interaction.customId.replace('sugg_status_', '');
        
        let newStatus = '';
        let newColor = '';
        let newStatusText = '';

        if (action === 'accept') {
            newStatus = 'accepted';
            newColor = '#2ECC71'; // أخضر
            newStatusText = '🟢 تم التنفيذ / مقـبول';
        } else if (action === 'reject') {
            newStatus = 'rejected';
            newColor = '#E74C3C'; // أحمر
            newStatusText = '🔴 مـرفـوض';
        } else if (action === 'review') {
            newStatus = 'working';
            newColor = '#3498DB'; // أزرق
            newStatusText = '🔵 قـيـد الـعـمـل';
        }

        await db.query(`UPDATE suggestions SET "status" = $1 WHERE "messageID" = $2`, [newStatus, messageId]);

        const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
        const voteField = originalEmbed.data.fields[0].value; 
        
        originalEmbed.setColor(newColor).setFields(
            { name: '📊 التصويت', value: voteField, inline: true },
            { name: '📌 الحالة', value: newStatusText, inline: true }
        );

        await interaction.message.edit({ embeds: [originalEmbed] });
        await interaction.update({ content: `✅ تم تغيير حالة الاقتراح إلى: **${newStatusText}**`, components: [] });

        // (اختياري) إذا تم قبول الاقتراح، نصرف له مكافأة 500 مورا مثلاً
        if (action === 'accept') {
            try {
                const suggesterId = suggData.userID || suggData.userid;
                await db.query(`UPDATE levels SET "mora" = "mora" + 500 WHERE "user" = $1 AND "guild" = $2`, [suggesterId, interaction.guild.id]);
                interaction.channel.send(`🎉 تم تطبيق اقتراح <@${suggesterId}>! وقد حصل على **500** <:mora:1435647151349698621> كمكافأة إبداع!`);
            } catch(e) {}
        }
    }
}

module.exports = {
    handleNewSuggestion,
    handleSuggestionButtons
};
