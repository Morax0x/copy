const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField } = require('discord.js');

const SUGGESTION_COOLDOWN = new Map();

async function handleNewSuggestion(message, client, db) {
    if (message.author.bot) return;

    const content = message.content.trim();
    if (content.length < 10) {
        message.delete().catch(() => {});
        return message.author.send("❌ **عذراً،** يجب أن يكون الاقتراح واضحاً ويحتوي على الأقل 10 أحرف!").catch(() => {});
    }

    const cooldownTime = 15 * 60 * 1000; 
    const now = Date.now();
    const userCooldown = SUGGESTION_COOLDOWN.get(message.author.id);

    if (userCooldown && now < userCooldown) {
        message.delete().catch(() => {});
        const minutesLeft = Math.ceil((userCooldown - now) / 60000);
        return message.author.send(`⏱️ **مهلاً!** لا يمكنك إرسال اقتراح جديد الآن. يرجى الانتظار \`${minutesLeft}\` دقيقة.`).catch(() => {});
    }
    
    SUGGESTION_COOLDOWN.set(message.author.id, now + cooldownTime);

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

    // بناء الإيمبد الفخم حسب التصميم المطلوب
    const embed = new EmbedBuilder()
        .setDescription(`✶ اقتـرح: <@${message.author.id}>\n\n> ✦ ${content}`)
        .setColor('Random') 
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true })) 
        .addFields(
            { name: 'الإحصائيات', value: '✶ <:like:1483055245310296265> : `0`\n✶ <:dislike:1483055246933757963> : `0`', inline: true },
            { name: 'الحالة', value: '🟡 قيد المراجعة', inline: true }
        )
        .setFooter({ text: 'Empire | الامبراطورية ™', iconURL: message.guild.iconURL({ dynamic: true }) });

    // 🔥 الحل الجذري لمشكلة الصور المعطلة
    const files = [];
    if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        if (attachment.contentType && attachment.contentType.startsWith('image/')) {
            // نأمر البوت برفع الصورة كملف مرفق جديد بدلاً من الاعتماد على رابط الرسالة القديمة
            files.push({ attachment: attachment.url, name: attachment.name });
            embed.setImage(`attachment://${attachment.name}`);
        }
    }

    // الأزرار بدون نص (ايموجيات فقط)
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('sugg_upvote').setStyle(ButtonStyle.Secondary).setEmoji('1483055245310296265'),
        new ButtonBuilder().setCustomId('sugg_downvote').setStyle(ButtonStyle.Secondary).setEmoji('1483055246933757963'),
        new ButtonBuilder().setCustomId('sugg_admin').setStyle(ButtonStyle.Secondary).setEmoji('1437804676224516146')
    );

    try {
        // 🔥 نرسل الإيمبد مع مصفوفة الـ files لكي يستضيف ديسكورد الصورة من جديد
        const suggestionMsg = await message.channel.send({ embeds: [embed], components: [row], files: files });
        message.delete().catch(() => {});

        try {
            await db.query(`
                INSERT INTO suggestions ("messageID", "guildID", "userID", "content", "status", "upvotes", "downvotes", "createdAt")
                VALUES ($1, $2, $3, $4, 'pending', 0, 0, $5)
            `, [suggestionMsg.id, message.guild.id, message.author.id, content, now]);
        } catch (e) {
            await db.query(`
                INSERT INTO suggestions (messageid, guildid, userid, content, status, upvotes, downvotes, createdat)
                VALUES ($1, $2, $3, $4, 'pending', 0, 0, $5)
            `, [suggestionMsg.id, message.guild.id, message.author.id, content, now]).catch(()=>{});
        }

        // اسم الثريد بالتصميم الجديد
        await suggestionMsg.startThread({
            name: `ᗢ〢💭・اقتـراح・${message.author.username}`,
            autoArchiveDuration: 1440, 
            reason: 'نقاش اقتراح جديد'
        });

    } catch (err) {
        console.error("Error sending/saving suggestion:", err);
    }
}

async function handleSuggestionButtons(interaction, client, db) {
    if (!interaction.isButton() || !interaction.customId.startsWith('sugg_')) return;

    const targetMsgId = interaction.customId.startsWith('sugg_status_') ? interaction.customId.split('_')[3] : interaction.message.id;
    const userId = interaction.user.id;

    let suggRes;
    try { suggRes = await db.query(`SELECT * FROM suggestions WHERE "messageID" = $1`, [targetMsgId]); }
    catch (e) { suggRes = await db.query(`SELECT * FROM suggestions WHERE messageid = $1`, [targetMsgId]).catch(()=>({rows:[]})); }
    
    const suggData = suggRes.rows[0];
    if (!suggData) return interaction.reply({ content: '❌ هذا الاقتراح غير مسجل أو محذوف.', flags: [MessageFlags.Ephemeral] });

    if (interaction.customId === 'sugg_admin') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ هذا الزر مخصص لإدارة السيرفر فقط!', flags: [MessageFlags.Ephemeral] });
        }

        const adminRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`sugg_status_accept_${targetMsgId}`).setLabel('قبول/تنفيذ').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`sugg_status_reject_${targetMsgId}`).setLabel('رفض').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`sugg_status_review_${targetMsgId}`).setLabel('قيد العمل').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`sugg_status_reply_${targetMsgId}`).setLabel('إضافة رد').setStyle(ButtonStyle.Secondary).setEmoji('✍️')
        );

        return interaction.reply({ content: '⚙️ **خيارات إدارة الاقتراح:**', components: [adminRow], flags: [MessageFlags.Ephemeral] });
    }

    if (interaction.customId === 'sugg_upvote' || interaction.customId === 'sugg_downvote') {
        const voteType = interaction.customId === 'sugg_upvote' ? 'up' : 'down';

        if (suggData.userID === userId || suggData.userid === userId) {
            return interaction.reply({ content: '❌ لا يمكنك التصويت على اقتراحك الخاص!', flags: [MessageFlags.Ephemeral] });
        }

        let userVoteRes;
        try { userVoteRes = await db.query(`SELECT "voteType" FROM suggestion_votes WHERE "messageID" = $1 AND "userID" = $2`, [targetMsgId, userId]); }
        catch(e) { userVoteRes = await db.query(`SELECT votetype as "voteType" FROM suggestion_votes WHERE messageid = $1 AND userid = $2`, [targetMsgId, userId]).catch(()=>({rows: []})); }
        
        const userVote = userVoteRes.rows[0];

        if (userVote) {
            const oldVoteType = userVote.voteType || userVote.votetype;
            if (oldVoteType === voteType) {
                return interaction.reply({ content: '⚠️ لقد قمت بالتصويت بهذا الخيار مسبقاً!', flags: [MessageFlags.Ephemeral] });
            }

            if (voteType === 'up') {
                try { await db.query(`UPDATE suggestions SET "upvotes" = "upvotes" + 1, "downvotes" = "downvotes" - 1 WHERE "messageID" = $1`, [targetMsgId]); }
                catch(e) { await db.query(`UPDATE suggestions SET upvotes = upvotes + 1, downvotes = downvotes - 1 WHERE messageid = $1`, [targetMsgId]).catch(()=>{}); }
            } else {
                try { await db.query(`UPDATE suggestions SET "upvotes" = "upvotes" - 1, "downvotes" = "downvotes" + 1 WHERE "messageID" = $1`, [targetMsgId]); }
                catch(e) { await db.query(`UPDATE suggestions SET upvotes = upvotes - 1, downvotes = downvotes + 1 WHERE messageid = $1`, [targetMsgId]).catch(()=>{}); }
            }
            
            try { await db.query(`UPDATE suggestion_votes SET "voteType" = $1 WHERE "messageID" = $2 AND "userID" = $3`, [voteType, targetMsgId, userId]); }
            catch(e) { await db.query(`UPDATE suggestion_votes SET votetype = $1 WHERE messageid = $2 AND userid = $3`, [voteType, targetMsgId, userId]).catch(()=>{}); }
            
            await interaction.reply({ content: '✅ تم تغيير تصويتك بنجاح.', flags: [MessageFlags.Ephemeral] });

        } else {
            if (voteType === 'up') {
                try { await db.query(`UPDATE suggestions SET "upvotes" = "upvotes" + 1 WHERE "messageID" = $1`, [targetMsgId]); }
                catch(e) { await db.query(`UPDATE suggestions SET upvotes = upvotes + 1 WHERE messageid = $1`, [targetMsgId]).catch(()=>{}); }
            } else {
                try { await db.query(`UPDATE suggestions SET "downvotes" = "downvotes" + 1 WHERE "messageID" = $1`, [targetMsgId]); }
                catch(e) { await db.query(`UPDATE suggestions SET downvotes = downvotes + 1 WHERE messageid = $1`, [targetMsgId]).catch(()=>{}); }
            }
            
            try { await db.query(`INSERT INTO suggestion_votes ("messageID", "userID", "voteType") VALUES ($1, $2, $3)`, [targetMsgId, userId, voteType]); }
            catch(e) { await db.query(`INSERT INTO suggestion_votes (messageid, userid, votetype) VALUES ($1, $2, $3)`, [targetMsgId, userId, voteType]).catch(()=>{}); }
            
            await interaction.reply({ content: '✅ تم تسجيل تصويتك.', flags: [MessageFlags.Ephemeral] });
        }

        let updatedSuggRes;
        try { updatedSuggRes = await db.query(`SELECT "upvotes", "downvotes", "status" FROM suggestions WHERE "messageID" = $1`, [targetMsgId]); }
        catch(e) { updatedSuggRes = await db.query(`SELECT upvotes, downvotes, status FROM suggestions WHERE messageid = $1`, [targetMsgId]).catch(()=>({rows:[{upvotes:0, downvotes:0}]})); }
        
        const newStats = updatedSuggRes.rows[0];
        const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
        
        const fields = originalEmbed.data.fields;
        
        // تحديث حقل الإحصائيات (الحقل الأول)
        fields[0].value = `✶ <:like:1483055245310296265> : \`${newStats.upvotes || newStats.upvotes}\`\n✶ <:dislike:1483055246933757963> : \`${newStats.downvotes || newStats.downvotes}\``;

        originalEmbed.setFields(fields);
        await interaction.message.edit({ embeds: [originalEmbed] });
    }

    if (interaction.customId.startsWith('sugg_status_')) {
        const action = interaction.customId.split('_')[2]; 
        
        if (action === 'reply') {
            const modal = new ModalBuilder()
                .setCustomId(`sugg_modal_reply_${targetMsgId}`)
                .setTitle('إضافة رد إداري للاقتراح');
                
            const textInput = new TextInputBuilder()
                .setCustomId('sugg_reply_text')
                .setLabel('اكتب ردك هنا لصحاب الاقتراح:')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);
                
            modal.addComponents(new ActionRowBuilder().addComponents(textInput));
            return await interaction.showModal(modal);
        }

        let newStatus = '';
        let newColor = '';
        let newStatusText = '';

        if (action === 'accept') {
            newStatus = 'accepted';
            newColor = '#2ECC71'; 
            newStatusText = 'مـقبـول'; 
        } else if (action === 'reject') {
            newStatus = 'rejected';
            newColor = '#E74C3C'; 
            newStatusText = '🔴 مـرفـوض';
        } else if (action === 'review') {
            newStatus = 'working';
            newColor = '#3498DB'; 
            newStatusText = '🔵 قـيـد الـعـمـل';
        }

        try { await db.query(`UPDATE suggestions SET "status" = $1 WHERE "messageID" = $2`, [newStatus, targetMsgId]); }
        catch(e) { await db.query(`UPDATE suggestions SET status = $1 WHERE messageid = $2`, [newStatus, targetMsgId]).catch(()=>{}); }

        const suggestionMsg = await interaction.channel.messages.fetch(targetMsgId).catch(()=>{});
        if(suggestionMsg) {
            const originalEmbed = EmbedBuilder.from(suggestionMsg.embeds[0]);
            
            let fields = [...originalEmbed.data.fields];
            
            // تحديث حقل الحالة (الحقل الثاني)
            fields[1] = { name: 'الحالة', value: newStatusText, inline: true };

            if (action === 'accept') {
                const hasReward = fields.some(f => f.value && f.value.includes('مكافـأة المفـكـر'));
                if (!hasReward) {
                    fields.push({ name: '\u200B', value: '⌯ مكافـأة المفـكـر: 500 <:mora:1435647151349698621>', inline: false });
                }
            } else {
                fields = fields.filter(f => !(f.value && f.value.includes('مكافـأة المفـكـر')));
            }

            originalEmbed.setColor(newColor).setFields(fields);
            await suggestionMsg.edit({ embeds: [originalEmbed] });
        }
        
        await interaction.update({ content: `✅ تم تغيير حالة الاقتراح إلى: **${newStatusText}**`, components: [] });

        if (action === 'accept') {
            try {
                const suggesterId = suggData.userID || suggData.userid;
                try { await db.query(`UPDATE levels SET "mora" = "mora" + 500 WHERE "user" = $1 AND "guild" = $2`, [suggesterId, interaction.guild.id]); }
                catch(e) { await db.query(`UPDATE levels SET mora = mora + 500 WHERE userid = $1 AND guildid = $2`, [suggesterId, interaction.guild.id]).catch(()=>{}); }
            } catch(e) {}
        }
    }
}

async function handleSuggestionModals(interaction, client, db) {
    if (!interaction.isModalSubmit() || !interaction.customId.startsWith('sugg_modal_reply_')) return;
    
    const targetMsgId = interaction.customId.replace('sugg_modal_reply_', '');
    const replyText = interaction.fields.getTextInputValue('sugg_reply_text');
    
    const suggestionMsg = await interaction.channel.messages.fetch(targetMsgId).catch(()=>{});
    if (!suggestionMsg) return interaction.reply({ content: '❌ لم أتمكن من العثور على رسالة الاقتراح.', flags: [MessageFlags.Ephemeral] });
    
    const originalEmbed = EmbedBuilder.from(suggestionMsg.embeds[0]);
    let fields = [...originalEmbed.data.fields];
    
    fields = fields.filter(f => f.name !== 'ᗢ رد الامـبراطـور');
    
    const rewardField = fields.find(f => f.value && f.value.includes('مكافـأة المفـكـر'));
    fields = fields.filter(f => !(f.value && f.value.includes('مكافـأة المفـكـر')));

    fields.push({ name: 'ᗢ رد الامـبراطـور', value: `> ✶ ${replyText}`, inline: false });
    
    if (rewardField) fields.push(rewardField);
    
    originalEmbed.setFields(fields);
    
    await suggestionMsg.edit({ embeds: [originalEmbed] });
    await interaction.reply({ content: '✅ تم إضافة الرد إلى الاقتراح بنجاح!', flags: [MessageFlags.Ephemeral] });
}

module.exports = {
    handleNewSuggestion,
    handleSuggestionButtons,
    handleSuggestionModals
};
