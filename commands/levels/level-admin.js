const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');

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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leveladmin')
        .setDescription('لوحة التحكم الشاملة بنظام المستويات (للمشرفين)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        
        .addSubcommand(subcommand => subcommand.setName('add').setDescription('إضافة مستويات لعضو')
            .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true))
            .addIntegerOption(option => option.setName('amount').setDescription('الكمية').setRequired(true)))
        
        .addSubcommand(subcommand => subcommand.setName('remove').setDescription('إزالة مستويات من عضو')
            .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true))
            .addIntegerOption(option => option.setName('amount').setDescription('الكمية').setRequired(true)))
        
        .addSubcommand(subcommand => subcommand.setName('set').setDescription('تحديد مستوى معين لعضو')
            .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true))
            .addIntegerOption(option => option.setName('level').setDescription('المستوى الجديد').setRequired(true)))
        
        .addSubcommand(subcommand => subcommand.setName('xp').setDescription('إضافة أو إزالة خبرة (XP)')
            .addUserOption(option => option.setName('action').setDescription('العملية').setRequired(true).addChoices({ name: 'إضافة', value: 'add' }, { name: 'إزالة', value: 'remove' }))
            .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true))
            .addIntegerOption(option => option.setName('amount').setDescription('الكمية').setRequired(true)))

        .addSubcommand(subcommand => subcommand.setName('channel').setDescription('تحديد قناة إشعارات التلفيل')
            .addChannelOption(option => option.setName('target').setDescription('القناة (اتركه فارغاً للوضع الافتراضي)').setRequired(false)))
        
        .addSubcommand(subcommand => subcommand.setName('message').setDescription('تخصيص رسالة التلفيل')
            .addStringOption(option => option.setName('action').setDescription('الخيار').setRequired(true).addChoices({ name: 'نمط الإمبراطورية', value: 'empire' }, { name: 'نص مخصص', value: 'custom' }, { name: 'عرض الحالي', value: 'show' }, { name: 'إعادة ضبط', value: 'reset' }))
            .addStringOption(option => option.setName('text').setDescription('النص المخصص (إذا اخترت نص مخصص)').setRequired(false)))

        .addSubcommand(subcommand => subcommand.setName('reward').setDescription('إعداد الرتب التلقائية للمستويات')
            .addStringOption(option => option.setName('action').setDescription('العملية').setRequired(true).addChoices({ name: 'إضافة', value: 'add' }, { name: 'حذف', value: 'remove' }, { name: 'عرض الكل', value: 'show' }))
            .addIntegerOption(option => option.setName('level').setDescription('المستوى').setRequired(false))
            .addRoleOption(option => option.setName('role').setDescription('الرتبة').setRequired(false)))

        .addSubcommand(subcommand => subcommand.setName('rolebuff').setDescription('تحديد بف دائم لرتبة معينة')
            .addRoleOption(option => option.setName('role').setDescription('الرتبة').setRequired(true))
            .addIntegerOption(option => option.setName('percent').setDescription('النسبة المئوية (مثال: 50)').setRequired(true)))
        
        .addSubcommand(subcommand => subcommand.setName('userbuff').setDescription('إعطاء بف مؤقت لعضو')
            .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true))
            .addIntegerOption(option => option.setName('percent').setDescription('النسبة المئوية').setRequired(true))
            .addIntegerOption(option => option.setName('hours').setDescription('عدد الساعات').setRequired(true))),

    name: 'leveladmin',
    aliases: ['la', 'add-level', 'remove-level', 'set-level', 'xp', 'setlevelchannel', 'setlevelmessage', 'role-level', 'setlevelrole', 'set-role-buff', 'give-buff'],
    category: "Leveling",
    description: "إدارة شاملة لنظام المستويات",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const db = client.sql;
        const guild = interactionOrMessage.guild;
        const guildId = guild.id;

        const member = isSlash ? interactionOrMessage.member : interactionOrMessage.member;
        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            const err = '🚫 لا تملك صلاحية `ManageGuild` لاستخدام هذا الأمر!';
            return isSlash ? interactionOrMessage.reply({ content: err, ephemeral: true }) : interactionOrMessage.reply(err);
        }

        try {
            await db.query(`CREATE TABLE IF NOT EXISTS level_roles (guildID TEXT, roleID TEXT, level INTEGER)`);
            await db.query(`CREATE TABLE IF NOT EXISTS role_buffs (guildID TEXT, roleID TEXT, buffPercent INTEGER)`);
            await db.query(`CREATE TABLE IF NOT EXISTS user_buffs (guildID TEXT, userID TEXT, buffPercent INTEGER, expiresAt BIGINT, buffType TEXT, multiplier REAL)`);
        } catch(e) {}

        let subcommand = '';
        let targetUser = null;
        let amount = 0;
        let actionStr = '';
        let textInput = '';
        let targetChannel = null;
        let targetRole = null;
        let hoursInput = 0;

        if (isSlash) {
            subcommand = interactionOrMessage.options.getSubcommand();
            targetUser = interactionOrMessage.options.getMember('user');
            amount = interactionOrMessage.options.getInteger('amount') || interactionOrMessage.options.getInteger('level') || interactionOrMessage.options.getInteger('percent') || 0;
            actionStr = interactionOrMessage.options.getString('action') || '';
            textInput = interactionOrMessage.options.getString('text') || '';
            targetChannel = interactionOrMessage.options.getChannel('target');
            targetRole = interactionOrMessage.options.getRole('role');
            hoursInput = interactionOrMessage.options.getInteger('hours') || 0;
            await interactionOrMessage.deferReply();
        } else {
            const cmdName = interactionOrMessage.content.split(' ')[0].toLowerCase().slice(1); 
            
            if (cmdName.includes('add-level')) { subcommand = 'add'; targetUser = interactionOrMessage.mentions.members.first(); amount = parseInt(args[1]); }
            else if (cmdName.includes('remove-level')) { subcommand = 'remove'; targetUser = interactionOrMessage.mentions.members.first(); amount = parseInt(args[1]); }
            else if (cmdName.includes('set-level')) { subcommand = 'set'; targetUser = interactionOrMessage.mentions.members.first(); amount = parseInt(args[1]); }
            else if (cmdName.includes('xp')) { subcommand = 'xp'; actionStr = args[0]; targetUser = interactionOrMessage.mentions.members.first(); amount = parseInt(args[2]); }
            else if (cmdName.includes('setlevelchannel')) { subcommand = 'channel'; targetChannel = interactionOrMessage.mentions.channels.first(); if(args[0]==='reset') targetChannel = 'reset'; }
            else if (cmdName.includes('setlevelmessage')) { subcommand = 'message'; actionStr = args[0]; textInput = args.slice(1).join(' '); }
            else if (cmdName.includes('role-level') || cmdName.includes('setlevelrole')) { subcommand = 'reward'; actionStr = args[0] || 'add'; amount = parseInt(args[1]); targetRole = interactionOrMessage.mentions.roles.first(); }
            else if (cmdName.includes('set-role-buff')) { subcommand = 'rolebuff'; targetRole = interactionOrMessage.mentions.roles.first(); amount = parseInt(args[1]); }
            else if (cmdName.includes('give-buff')) { subcommand = 'userbuff'; targetUser = interactionOrMessage.mentions.members.first(); amount = parseInt(args[1]); hoursInput = parseInt(args[2]); }
        }

        const reply = async (payload) => {
            if (isSlash) return interactionOrMessage.editReply(payload);
            return interactionOrMessage.reply(payload);
        };

        try {
            if (['add', 'remove', 'set', 'xp'].includes(subcommand)) {
                if (!targetUser || isNaN(amount)) return reply("❌ بيانات غير مكتملة (يرجى تحديد العضو والرقم).");
                
                let score = await client.getLevel(targetUser.id, guildId);
                if (!score) score = { ...client.defaultData, user: targetUser.id, guild: guildId };
                
                score.level = Number(score.level) || 1;
                score.xp = Number(score.xp) || 0;
                score.totalXP = Number(score.totalxp || score.totalXP) || 0;
                const oldLevel = score.level;
                let embed = new EmbedBuilder().setColor("Random");

                if (subcommand === 'add') {
                    const newLvl = score.level + amount;
                    score.level = newLvl; score.xp = 0; score.totalXP = calculateTotalXP(newLvl);
                    embed.setTitle(`Success!`).setDescription(`تمت إضافة ${amount} مستوى لـ ${targetUser}! (المستوى الجديد: ${score.level})`);
                } 
                else if (subcommand === 'remove') {
                    const newLvl = Math.max(1, score.level - amount);
                    const rec = recalculateLevel(calculateTotalXP(newLvl));
                    score.level = rec.level; score.xp = rec.xp; score.totalXP = rec.totalXP;
                    embed.setTitle(`Success!`).setDescription(`تمت إزالة ${amount} مستوى من ${targetUser}! (المستوى الجديد: ${score.level})`);
                } 
                else if (subcommand === 'set') {
                    const rec = recalculateLevel(calculateTotalXP(amount));
                    score.level = rec.level; score.xp = rec.xp; score.totalXP = rec.totalXP;
                    embed.setTitle(`Success!`).setDescription(`تم تحديد مستوى ${targetUser} إلى ${amount}!`);
                } 
                else if (subcommand === 'xp') {
                    let newTot = actionStr === 'add' ? score.totalXP + amount : Math.max(0, score.totalXP - amount);
                    const rec = recalculateLevel(newTot);
                    score.level = rec.level; score.xp = rec.xp; score.totalXP = rec.totalXP;
                    embed.setTitle(actionStr==='add'?`✅ إضافة خبرة`:`🗑️ إزالة خبرة`).setDescription(`الخبرة الحالية: ${score.xp} | المستوى: ${score.level}`);
                }

                await client.setLevel(score);
                if (score.level !== oldLevel) await client.checkAndAwardLevelRoles(targetUser, score.level);
                return reply({ embeds: [embed] });
            }

            if (subcommand === 'channel') {
                if (!targetChannel || targetChannel === 'reset') {
                    await db.query("UPDATE settings SET levelChannel = NULL WHERE guild = $1", [guildId]);
                    return reply("✅ تم إعادة التعيين. سيتم إرسال بطاقة اللفل في نفس القناة التي يتفاعل فيها العضو.");
                } else {
                    await db.query(`INSERT INTO settings (guild, levelChannel) VALUES ($1, $2) ON CONFLICT(guild) DO UPDATE SET levelChannel = EXCLUDED.levelChannel`, [guildId, targetChannel.id]);
                    return reply(`✅ تم تحديد قناة الإشعارات: ${targetChannel}`);
                }
            }

            if (subcommand === 'message') {
                if (actionStr === 'empire') {
                    const desc = "╭⭒★︰ <a:wi:1435572304988868769> {member} <a:wii:1435572329039007889>\\n✶ مبارك صعودك في سُلّم الإمبراطورية\\n★ فقد كـسرت حـاجـز الـمستوى〃{level_old}〃وبلغـت المسـتـوى الـ 〃{level}〃 <a:MugiStronk:1438795606872166462> وتعاظم شأنك بين جموع الرعية فامضِ قُدمًا نحو المجد <:2KazumaSalut:1437129108806176768>";
                    await db.query("UPDATE settings SET lvlUpDesc = $1, lvlUpTitle = NULL, lvlUpImage = NULL WHERE guild = $2", [desc, guildId]);
                    return reply("✅ **تم تفعيل نمط الإمبراطورية!**");
                } 
                else if (actionStr === 'custom' || actionStr === 'desc') {
                    if(!textInput) return reply("❌ يرجى إدخال النص.");
                    await db.query("UPDATE settings SET lvlUpDesc = $1, lvlUpTitle = NULL, lvlUpImage = NULL WHERE guild = $2", [textInput, guildId]);
                    return reply("✅ تم تحديث النص المخصص.");
                }
                else if (actionStr === 'reset') {
                    await db.query("UPDATE settings SET lvlUpDesc = NULL, lvlUpTitle = NULL, lvlUpImage = NULL WHERE guild = $1", [guildId]);
                    return reply("✅ تم العودة للرسالة الافتراضية.");
                }
                else if (actionStr === 'show') {
                    const setRes = await db.query("SELECT lvlUpDesc FROM settings WHERE guild = $1", [guildId]);
                    let msg = setRes.rows[0]?.lvlupdesc || "الرسالة الافتراضية للنظام.";
                    msg = msg.replace(/{member}/gi, `<@${interactionOrMessage.member.id}>`).replace(/{level}/gi, `10`).replace(/{level_old}/gi, `9`).replace(/\\n/g, '\n');
                    return reply(`**معاينة النص الحالي:**\n\n${msg}`);
                }
            }

            if (subcommand === 'reward') {
                if (actionStr === 'add') {
                    if (!amount || !targetRole) return reply("❌ يرجى تحديد اللفل والرتبة.");
                    await db.query("DELETE FROM level_roles WHERE guildID = $1 AND level = $2", [guildId, amount]);
                    await db.query("INSERT INTO level_roles (guildID, roleID, level) VALUES ($1, $2, $3)", [guildId, targetRole.id, amount]);
                    return reply(`✅ سيتم إعطاء رتبة ${targetRole} عند الوصول للمستوى **${amount}**.`);
                } 
                else if (actionStr === 'remove' || actionStr === 'delete') {
                    if (!amount) return reply("❌ يرجى تحديد اللفل.");
                    await db.query("DELETE FROM level_roles WHERE guildID = $1 AND level = $2", [guildId, amount]);
                    return reply(`✅ تم حذف رتبة المستوى **${amount}**.`);
                }
                else if (actionStr === 'show' || actionStr === 'list') {
                    const rolesRes = await db.query("SELECT * FROM level_roles WHERE guildID = $1 ORDER BY level ASC", [guildId]);
                    if (rolesRes.rows.length === 0) return reply("⚠️ لا توجد رتب مستويات مضافة.");
                    let desc = rolesRes.rows.map(r => `🔹 **مستوى ${r.level}**: <@&${r.roleid || r.roleID}>`).join('\n');
                    return reply({ embeds: [new EmbedBuilder().setTitle('📜 قائمة رتب المستويات').setDescription(desc).setColor('Blue')] });
                }
            }

            if (subcommand === 'rolebuff') {
                if (!targetRole || isNaN(amount)) return reply("❌ يرجى تحديد الرتبة والنسبة.");
                await db.query("DELETE FROM role_buffs WHERE roleID = $1", [targetRole.id]);
                if (amount !== 0) {
                    await db.query("INSERT INTO role_buffs (guildID, roleID, buffPercent) VALUES ($1, $2, $3)", [guildId, targetRole.id, amount]);
                    return reply(`✅ تم تعيين البف للرتبة ${targetRole} بنسبة **${amount}%**.`);
                }
                return reply(`✅ تم إزالة البف من الرتبة ${targetRole}.`);
            }

            if (subcommand === 'userbuff') {
                if (!targetUser || isNaN(amount) || isNaN(hoursInput)) return reply("❌ يرجى تحديد العضو، النسبة، وعدد الساعات.");
                const expiresAt = Date.now() + (hoursInput * 60 * 60 * 1000);
                const multiplier = amount / 100;
                await db.query("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES ($1, $2, $3, $4, $5, $6)", [guildId, targetUser.id, amount, expiresAt, 'xp', multiplier]);
                return reply(`✅ تم إعطاء بف **${amount}%** للعضو ${targetUser} لمدة **${hoursInput}** ساعة.`);
            }

        } catch (err) {
            console.error("Level Admin Error:", err);
            reply("❌ حدث خطأ داخلي أثناء معالجة الطلب.");
        }
    }
};
