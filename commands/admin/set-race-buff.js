// commands/admin/set-race-buff.js
const { PermissionFlagsBits, EmbedBuilder, Colors } = require("discord.js");

// ✅ تصحيح المسار ليكون متوافقاً مع مكان الملف
const dungeonConfig = require('../../json/dungeon-config.json');

module.exports = {
    name: 'set-race-buff',
    // ✅ تمت إضافة اختصارات عربية كثيرة لسهولة الاستخدام
    aliases: ['setbuff', 'ميزة', 'ميزات', 'بفات', 'بف', 'قائمة_الميزات', 'racebuffs'], 
    category: "Admin",
    description: 'تعيين ميزة خاصة لرتبة معينة أو عرض القائمة الحالية.',

    async execute(message, args) {
        const client = message.client;
        const sql = client.sql;
        const member = message.member;

        // 1. التحقق من الصلاحيات
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply("❌ **ليس لديك صلاحية لاستخدام هذا الأمر!**");
        }

        // =================================================================
        // 📊 الوضع الأول: عرض القائمة (List Mode)
        // يعمل إذا لم يكتب المستخدم شيئاً، أو كتب كلمة "قائمة"
        // =================================================================
        if (!args[0] || ['list', 'قائمة', 'الكل', 'all'].includes(args[0].toLowerCase())) {
            
            // التأكد من وجود الجدول أولاً
            try {
                const tableCheck = sql.prepare("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='race_dungeon_buffs'").get();
                if (!tableCheck['count(*)']) return message.reply("ℹ️ **لا توجد أي ميزات مسجلة حتى الآن.**");
            } catch (e) { return message.reply("ℹ️ **قاعدة البيانات فارغة.**"); }

            const allBuffs = sql.prepare("SELECT * FROM race_dungeon_buffs WHERE guildID = ?").all(message.guild.id);

            if (allBuffs.length === 0) {
                return message.reply("ℹ️ **لا توجد ميزات نشطة حالياً في السيرفر.**\nاستخدم الأمر لإضافة ميزة: `!ميزة @رتبة دانجون نوع نسبة`");
            }

            // تجميع البيانات لترتيبها في الرسالة
            // الشكل: { RoleID: [ "Dungeon: Stat +Value", ... ] }
            const groupedBuffs = {};

            allBuffs.forEach(buff => {
                if (!groupedBuffs[buff.roleID]) groupedBuffs[buff.roleID] = [];
                
                const dungeonName = dungeonConfig.themes[buff.dungeonKey]?.name || buff.dungeonKey;
                const statIcon = getStatIcon(buff.statType);
                
                groupedBuffs[buff.roleID].push(`**${dungeonName}:** ${statIcon} ${buff.statType.toUpperCase()} +${buff.buffValue}%`);
            });

            const embed = new EmbedBuilder()
                .setTitle(`📜 قائمة ميزات الأعراق المفعلة`)
                .setColor(Colors.Blue)
                .setFooter({ text: `عدد الرتب المفعلة: ${Object.keys(groupedBuffs).length}` });

            let description = "";
            for (const [roleID, buffs] of Object.entries(groupedBuffs)) {
                const role = message.guild.roles.cache.get(roleID);
                const roleName = role ? role.name : "رتبة محذوفة";
                
                description += `### 🎭 ${roleName}\n`;
                description += buffs.map(b => `> ${b}`).join('\n') + "\n\n";
            }

            // تقسيم الرسالة إذا كانت طويلة جداً
            if (description.length > 4000) description = description.substring(0, 4000) + "... (القائمة طويلة جداً)";
            
            embed.setDescription(description || "لا يوجد بيانات.");
            return message.reply({ embeds: [embed] });
        }

        // =================================================================
        // ⚙️ الوضع الثاني: تعيين ميزة (Set Mode)
        // =================================================================

        // 2. التحقق من الرتبة
        const role = message.mentions.roles.first();
        if (!role) {
            return message.reply({ 
                content: "❌ **طريقة الاستخدام:**\n`!ميزة @الرتبة [الدانجون] [النوع] [النسبة]`\nأو لعرض القائمة: `!ميزة قائمة`\n\nمثال:\n`!ميزة @تنين تارتاروس هجوم 5`" 
            });
        }

        // 3. التحقق من الدانجون
        const inputDungeon = args[1] ? args[1].toLowerCase() : "";
        const dungeonKey = Object.keys(dungeonConfig.themes).find(key => 
            key === inputDungeon || dungeonConfig.themes[key].name.toLowerCase().includes(inputDungeon)
        );

        if (!dungeonKey) {
            const validDungeons = Object.keys(dungeonConfig.themes)
                .map(k => `${dungeonConfig.themes[k].name}`)
                .join('، ');
            return message.reply(`❌ **اسم الدانجون غير صحيح!**\nالمتاح: ${validDungeons}`);
        }

        // 4. التحقق من نوع الميزة
        const statMap = {
            'هجوم': 'atk', 'atk': 'atk', 'attack': 'atk', 'قوة': 'atk',
            'اتش_بي': 'hp', 'hp': 'hp', 'صحة': 'hp', 'health': 'hp', 'حيوية': 'hp',
            'دفاع': 'def', 'def': 'def', 'defense': 'def', 'صلابة': 'def',
            'درع': 'shield', 'shield': 'shield',
            'شفاء': 'lifesteal', 'lifesteal': 'lifesteal', 'امتصاص': 'lifesteal',
            'كريت': 'crit', 'crit': 'crit', 'مهارة': 'crit', 'حرجة': 'crit'
        };
        
        const inputStat = args[2] ? args[2].toLowerCase() : null;
        const stat = statMap[inputStat];

        if (!stat) {
            return message.reply("❌ **نوع الميزة غير صحيح!**\nالأنواع: هجوم، صحة، دفاع، درع، شفاء، كريت");
        }

        // 5. التحقق من النسبة
        const percent = args[3] ? parseInt(args[3].replace('%', '')) : null;

        if (!percent || isNaN(percent) || percent < 1 || percent > 100) {
            return message.reply("❌ **النسبة غير صحيحة!** (يجب أن تكون رقم بين 1 و 100).");
        }

        // 6. الحفظ في قاعدة البيانات
        try {
            sql.prepare(`
                CREATE TABLE IF NOT EXISTS race_dungeon_buffs (
                    guildID TEXT,
                    roleID TEXT,
                    dungeonKey TEXT,
                    statType TEXT,
                    buffValue INTEGER,
                    PRIMARY KEY (guildID, roleID, dungeonKey)
                )
            `).run();

            sql.prepare(`
                INSERT OR REPLACE INTO race_dungeon_buffs (guildID, roleID, dungeonKey, statType, buffValue)
                VALUES (?, ?, ?, ?, ?)
            `).run(message.guild.id, role.id, dungeonKey, stat, percent);

            const dungeonName = dungeonConfig.themes[dungeonKey]?.name || dungeonKey;

            const embed = new EmbedBuilder()
                .setTitle("✅ تم تفعيل ميزة العرق")
                .setColor(Colors.Gold)
                .setDescription(`تم تخصيص ميزة خاصة لحاملي رتبة ${role}`)
                .addFields(
                    { name: '🗺️ المكان (Dungeon)', value: `${dungeonName}`, inline: true },
                    { name: '📈 الميزة (Stat)', value: `${getStatIcon(stat)} ${stat.toUpperCase()} +${percent}%`, inline: true }
                )
                .setFooter({ text: "نظام تعزيز الأعراق - EMorax" })
                .setTimestamp();

            return message.reply({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            return message.reply("❌ حدث خطأ أثناء حفظ البيانات في قاعدة البيانات.");
        }
    }
};

// دالة مساعدة للأيقونات
function getStatIcon(stat) {
    switch (stat) {
        case 'atk': return '⚔️';
        case 'hp': return '❤️';
        case 'def': return '🛡️';
        case 'shield': return '💠';
        case 'crit': return '✨';
        case 'lifesteal': return '🩸';
        default: return '🔹';
    }
}
