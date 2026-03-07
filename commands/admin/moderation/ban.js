const { PermissionsBitField, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
    name: 'ban',
    description: 'حظر عضو من السيرفر',
    aliases: ['تفو', 'حظر', 'باند', 'نفي'],
    category: 'Admin',
    usage: 'ban <@user/ID> [السبب]',
    
    async execute(message, args) {
        const db = message.client.sql;

        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return;

        if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            return message.reply({ content: '❌ **لا أملك صلاحية "Ban Members".**', allowedMentions: { repliedUser: false } });
        }

        const targetArg = args[0];
        const reason = args.slice(1).join(" ") || "مخالفة القوانين - طرد نهائي";

        if (!targetArg) {
            return message.reply({ content: '❓ **منشن الضحية.**', allowedMentions: { repliedUser: false } });
        }

        let targetMember;
        try {
            targetMember = message.mentions.members.first() || await message.guild.members.fetch(targetArg);
        } catch (err) {
            try {
                const user = await message.client.users.fetch(targetArg);
                return hackBan(message, user, reason, db);
            } catch (e) {
                return message.reply({ content: '❌ **لم يتم العثور على العضو.**', allowedMentions: { repliedUser: false } });
            }
        }

        if (targetMember.id === message.author.id) return message.reply('❌ **لا يمكنك حظر نفسك.**');
        if (targetMember.id === message.guild.ownerId) return message.reply('❌ **لا يمكنك حظر مالك السيرفر.**');
        if (message.author.id !== message.guild.ownerId && targetMember.roles.highest.position >= message.member.roles.highest.position) {
            return message.reply('❌ **لا يمكنك حظر شخص رتبته أعلى منك أو مساوية لك.**');
        }
        if (!targetMember.bannable) {
            return message.reply('❌ **لا يمكنني حظر هذا العضو (رتبته أعلى مني).**');
        }

        const lastCaseRes = await db.query("SELECT caseID FROM mod_cases WHERE guildID = $1 ORDER BY caseID DESC LIMIT 1", [message.guild.id]);
        let lastCase = lastCaseRes.rows[0];
        let newCaseID = lastCase ? parseInt(lastCase.caseid || lastCase.caseID) + 1 : 1;
        const uniqueID = `${message.guild.id}-${newCaseID}`;

        try {
            const dmEmbed = new EmbedBuilder()
                .setTitle('✥ تـم نفـيـك من الامبراطورية')
                .setDescription('✶ تـم حرمانـك من دخـول اراضي الامبراطوريـة مدى الحـياة')
                .setColor('Random')
                .setImage('https://i.postimg.cc/V62NcMxz/lick-(1).gif');

            await targetMember.send({ embeds: [dmEmbed] });
        } catch (e) { }

        try {
            await targetMember.ban({ reason: `[Banned by ${message.author.tag}] Reason: ${reason}` });
        } catch (err) {
            console.error(err);
            return message.reply('❌ **حدث خطأ أثناء محاولة الحظر.**');
        }

        await db.query(`INSERT INTO mod_cases (id, guildID, caseID, type, targetID, moderatorID, reason, timestamp) 
                     VALUES ($1, $2, $3, 'BAN', $4, $5, $6, $7)`, 
                     [uniqueID, message.guild.id, newCaseID, targetMember.id, message.author.id, reason, Date.now()]);

        const chatEmbed = new EmbedBuilder()
            .setDescription('✥ تـم النفـي من الامبراطـوريـة')
            .setColor('Random')
            .setImage('https://i.postimg.cc/V62NcMxz/lick-(1).gif');

        message.reply({ embeds: [chatEmbed], allowedMentions: { repliedUser: false } });

        await sendModLog(message, targetMember.user, reason, newCaseID, db);
    }
};

async function hackBan(message, user, reason, db) {
    try {
        await message.guild.members.ban(user.id, { reason: `[Hackban by ${message.author.tag}] Reason: ${reason}` });
        
        const lastCaseRes = await db.query("SELECT caseID FROM mod_cases WHERE guildID = $1 ORDER BY caseID DESC LIMIT 1", [message.guild.id]);
        let lastCase = lastCaseRes.rows[0];
        let newCaseID = lastCase ? parseInt(lastCase.caseid || lastCase.caseID) + 1 : 1;
        const uniqueID = `${message.guild.id}-${newCaseID}`;
        
        await db.query(`INSERT INTO mod_cases (id, guildID, caseID, type, targetID, moderatorID, reason, timestamp) 
                     VALUES ($1, $2, $3, 'BAN', $4, $5, $6, $7)`,
           [uniqueID, message.guild.id, newCaseID, user.id, message.author.id, reason, Date.now()]);

        const chatEmbed = new EmbedBuilder()
            .setDescription('✥ تـم النفـي من الامبراطـوريـة')
            .setColor('Random')
            .setImage('https://i.postimg.cc/V62NcMxz/lick-(1).gif');

        message.reply({ embeds: [chatEmbed] });
        
        await sendModLog(message, user, reason, newCaseID, db, true);
    } catch (e) {
        message.reply("❌ حدث خطأ، تأكد أن الآيدي صحيح.");
    }
}

async function sendModLog(message, user, reason, caseID, db, isHackban = false) {
    const settingsRes = await db.query("SELECT modLogChannelID FROM settings WHERE guild = $1", [message.guild.id]);
    const settings = settingsRes.rows[0];
    
    if (settings && (settings.modlogchannelid || settings.modLogChannelID)) {
        const logChannel = message.guild.channels.cache.get(settings.modlogchannelid || settings.modLogChannelID);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle(isHackban ? `🔴 New HackBan | Case #${caseID}` : `🔴 New Ban | Case #${caseID}`)
                .setColor(Colors.Red)
                .setThumbnail(user.displayAvatarURL())
                .addFields(
                    { name: '👤 العضو', value: `${user.tag} (${user.id})`, inline: true },
                    { name: '👮 المشرف', value: `${message.author.tag} (${message.author.id})`, inline: true },
                    { name: '📝 السبب', value: reason },
                    { name: '⏰ الوقت', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
                )
                .setFooter({ text: `EMorax Security System` });
            logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }
    }
}
