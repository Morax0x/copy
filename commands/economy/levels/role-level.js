const { EmbedBuilder, PermissionsBitField } = require("discord.js");

module.exports = {
    name: 'role-level',
    aliases: ['rlevel', 'level-roles', 'setlevelrole'],
    description: "إعداد رتب تلقائية عند الوصول لمستوى معين.",
    category: "Leveling",
    cooldown: 3,
    async execute (message, args) {
        // استدعاء قاعدة البيانات من الكلاينت مباشرة
        const client = message.client;
        const sql = client.sql; 

        if(!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return message.reply(`❌ ليس لدي صلاحية إدارة الرتب (Manage Roles)!`);
        }
        if(!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles) && !message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return message.reply(`❌ ليس لديك صلاحية لاستخدام هذا الأمر!`);
        }

        const prefix = "-"; // أو جلب البريفكس من الداتا بيس

        if(!args.length) {
            let embed = new EmbedBuilder()
                .setTitle(`إعدادات رتب المستويات`)
                .setDescription(`تحديد رتبة يحصل عليها العضو تلقائياً عند الوصول لمستوى محدد.`)
                .addFields(
                    { name: `${prefix}role-level add <level> <@role>`, value: `إضافة رتبة لمستوى معين.`},
                    { name: `${prefix}role-level remove <level>`, value: `حذف الرتبة من مستوى معين.`},
                    { name: `${prefix}role-level show`, value: `عرض جميع الرتب والمستويات.`}
                )
                .setColor("Random");

            return message.channel.send({ embeds: [embed] });
        }

        const method = args[0].toLowerCase();
        const levelArgs = parseInt(args[1]);
        
        // التأكد من الجدول الصحيح (level_roles)
        const getRole = sql.prepare("SELECT * FROM level_roles WHERE guildID = ? AND roleID = ? AND level = ?");
        const setRole = sql.prepare("INSERT OR REPLACE INTO level_roles (guildID, roleID, level) VALUES (@guildID, @roleID, @level);");

        // --- إضافة رتبة (ADD) ---
        if(method === 'add') {
            const roleArg = args.slice(2).join(' ');
            const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[2]) || message.guild.roles.cache.find(r => r.name === roleArg);

            if(isNaN(levelArgs) || !levelArgs || levelArgs < 1) {
                return message.reply(`❌ الرجاء كتابة رقم المستوى بشكل صحيح.`);
            } else {
                if(!role) {
                    return message.reply(`❌ الرجاء تحديد الرتبة (منشن أو آيدي).`);
                } else {
                    let RoleData = getRole.get(message.guild.id, role.id, levelArgs);
                    if(!RoleData) {
                        RoleData = {
                            guildID: message.guild.id,
                            roleID: role.id,
                            level: levelArgs
                        }
                        setRole.run(RoleData);
                        let embed = new EmbedBuilder()
                            .setTitle(`✅ تم الحفظ بنجاح!`)
                            .setDescription(`سيحصل الأعضاء على رتبة ${role} عند الوصول لمستوى **${levelArgs}**`)
                            .setColor("Green");
                        return message.channel.send({ embeds: [embed] });
                    } else {
                        // تحديث البيانات إذا كانت موجودة
                        sql.prepare(`DELETE FROM level_roles WHERE guildID = ? AND roleID = ? AND level = ?`).run(message.guild.id, role.id, levelArgs);
                        sql.prepare(`INSERT INTO level_roles (guildID, roleID, level) VALUES (?, ?, ?)`).run(message.guild.id, role.id, levelArgs);

                        let embed = new EmbedBuilder()
                            .setTitle(`✅ تم التحديث بنجاح!`)
                            .setDescription(`تم تحديث رتبة ${role} للمستوى **${levelArgs}**`)
                            .setColor("Green");
                        return message.channel.send({ embeds: [embed] });
                    }
                }
            }
        }

        // --- عرض القائمة (SHOW) ---
        if(method === 'show' || method === 'list') {
            const allRoles = sql.prepare(`SELECT * FROM level_roles WHERE guildID = ? ORDER BY level ASC`).all(message.guild.id);
            if(!allRoles || allRoles.length === 0) {
                return message.reply(`⚠️ لا توجد رتب مستويات مضافة حالياً.`);
            } else {
                let embed = new EmbedBuilder()
                    .setTitle(`📜 قائمة رتب المستويات`)
                    .setColor("Blue");

                let description = "";
                for(const data of allRoles) {
                    let LevelSet = data.level;
                    let RolesSet = data.roleID;
                    description += `🔹 **مستوى ${LevelSet}**: <@&${RolesSet}>\n`;
                }
                embed.setDescription(description);
                return message.channel.send({ embeds: [embed] });
            }
        }

        // --- حذف رتبة (REMOVE) ---
        if(method === 'remove' || method === 'delete') {
            const getLevel = sql.prepare(`SELECT * FROM level_roles WHERE guildID = ? AND level = ?`);
            const levels = getLevel.get(message.guild.id, levelArgs);

            if(isNaN(levelArgs) || !levelArgs || levelArgs < 1) {
                return message.reply(`❌ الرجاء تحديد المستوى المراد حذفه.`);
            } else {
                if(!levels) {
                    return message.reply(`❌ لا يوجد رتبة مسجلة لهذا المستوى.`);
                } else {
                    sql.prepare(`DELETE FROM level_roles WHERE guildID = ? AND level = ?`).run(message.guild.id, levelArgs);
                    let embed = new EmbedBuilder()
                        .setTitle(`✅ تم الحذف`)
                        .setDescription(`تم حذف الرتبة الخاصة بالمستوى **${levelArgs}**.`)
                        .setColor("Red");
                    return message.channel.send({ embeds: [embed] });
                }
            }
        }
    }
}
