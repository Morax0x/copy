const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, Colors } = require('discord.js');

// استدعاء ملفات الـ JSON (مع حماية في حال تغير المسار)
const weaponsConfig = require('../../json/weapons-config.json');
const skillsConfig = require('../../json/skills-config.json');
const upgradeMats = require('../../json/upgrade-materials.json');

let fishData = [], farmItems = [];
try { fishData = require('../../json/fish.json'); } catch(e) {}
try { farmItems = require('../../json/seeds.json').concat(require('../../json/feed-items.json')); } catch(e) {}

// دالة ذكية للبحث عن أي عنصر في كل ملفات الـ JSON وتحديد قسمه
function resolveItemInfo(itemId) {
    // 1. فحص موارد التطوير والكتب
    if (upgradeMats && upgradeMats.weapon_materials) {
        for (const race of upgradeMats.weapon_materials) {
            const mat = race.materials.find(m => m.id === itemId);
            if (mat) return { name: mat.name, emoji: mat.emoji, category: 'materials' };
        }
    }
    if (upgradeMats && upgradeMats.skill_books) {
        for (const cat of upgradeMats.skill_books) {
            const book = cat.books.find(b => b.id === itemId);
            if (book) return { name: book.name, emoji: book.emoji, category: 'materials' };
        }
    }

    // 2. فحص الأسماك ومعدات الصيد
    if (fishData && fishData.length > 0) {
        const fish = fishData.find(f => f.id === itemId || f.name === itemId);
        if (fish) return { name: fish.name, emoji: fish.emoji || '🐟', category: 'fishing' };
    }

    // 3. فحص المزرعة (بذور، محاصيل، أعلاف)
    if (farmItems && farmItems.length > 0) {
        const farmObj = farmItems.find(f => f.id === itemId || f.name === itemId);
        if (farmObj) return { name: farmObj.name, emoji: farmObj.emoji || '🌾', category: 'farming' };
    }

    // 4. عناصر غير معروفة (متفرقات)
    return { name: itemId, emoji: '📦', category: 'others' };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('عرض حقيبتك وممتلكاتك، مقسمة إلى فئات')
        .addUserOption(option => option.setName('user').setDescription('عرض حقيبة عضو آخر').setRequired(false)),
        
    name: 'حقيبة',
    aliases: ['inv', 'inventory', 'شنطة', 'اغراض'],
    category: 'RPG',

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const db = client.sql;
        const guildId = interactionOrMessage.guild.id;

        // 🔥 هذا هو السطر الذي تم إضافته لإصلاح الخطأ 🔥
        const user = isSlash ? interactionOrMessage.user : interactionOrMessage.author;

        let targetUser;
        if (isSlash) {
            targetUser = interactionOrMessage.options.getMember('user') || interactionOrMessage.member;
            await interactionOrMessage.deferReply();
        } else {
            targetUser = interactionOrMessage.mentions.members.first() || interactionOrMessage.guild.members.cache.get(args[0]) || interactionOrMessage.member;
        }

        const reply = async (payload) => isSlash ? interactionOrMessage.editReply(payload) : interactionOrMessage.reply(payload);

        if (!targetUser || targetUser.user.bot) {
            return reply({ content: "❌ لا يمكن عرض حقيبة هذا العضو." });
        }

        const userId = targetUser.id;

        // ==========================================
        // 📥 سحب البيانات من الداتابيز
        // ==========================================
        let inventory = [], weapons = [], skills = [];
        try {
            // سحب الأغراض
            let invRes;
            try { invRes = await db.query(`SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]); }
            catch(e) { invRes = await db.query(`SELECT * FROM user_inventory WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }
            inventory = invRes.rows;

            // سحب السلاح
            let wepRes;
            try { wepRes = await db.query(`SELECT * FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]); }
            catch(e) { wepRes = await db.query(`SELECT * FROM user_weapons WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }
            weapons = wepRes.rows;

            // سحب المهارات
            let skillRes;
            try { skillRes = await db.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]); }
            catch(e) { skillRes = await db.query(`SELECT * FROM user_skills WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>({rows:[]})); }
            skills = skillRes.rows;

        } catch (e) {
            console.error("Inventory Fetch Error:", e);
            return reply({ content: "❌ حدث خطأ أثناء سحب بيانات الحقيبة." });
        }

        // ==========================================
        // 🗂️ فرز العناصر
        // ==========================================
        const categories = {
            materials: [],
            fishing: [],
            farming: [],
            others: []
        };

        for (const row of inventory) {
            const itemId = row.itemID || row.itemid;
            const quantity = Number(row.quantity) || 0;
            if (quantity <= 0) continue;

            const itemInfo = resolveItemInfo(itemId);
            categories[itemInfo.category].push(`${itemInfo.emoji} **${itemInfo.name}** : \`${quantity.toLocaleString()}\``);
        }

        // ==========================================
        // 🖼️ بناء الصفحات (Embeds)
        // ==========================================
        const embeds = {};

        // 1. صفحة الأسلحة والمهارات
        const combatEmbed = new EmbedBuilder()
            .setTitle(`⚔️ المعدات القتالية لـ ${targetUser.displayName}`)
            .setColor(Colors.DarkRed)
            .setThumbnail(targetUser.user.displayAvatarURL({ dynamic: true }));

        let combatDesc = "**🗡️ السلاح الحالي:**\n";
        if (weapons.length > 0) {
            const wData = weapons[0];
            const wConf = weaponsConfig.find(w => w.race === (wData.raceName || wData.racename));
            if (wConf) {
                combatDesc += `> ${wConf.emoji} **${wConf.name}** (Lv.${wData.weaponLevel || wData.weaponlevel})\n`;
            } else {
                combatDesc += `> ❓ سلاح غير معروف\n`;
            }
        } else {
            combatDesc += `> لا يملك سلاحاً بعد.\n`;
        }

        combatDesc += "\n**📜 المهارات المكتسبة:**\n";
        if (skills.length > 0) {
            skills.forEach(s => {
                const sConf = skillsConfig.find(sc => sc.id === (s.skillID || s.skillid));
                if (sConf) {
                    combatDesc += `> ${sConf.emoji} **${sConf.name}** (Lv.${s.skillLevel || s.skilllevel})\n`;
                }
            });
        } else {
            combatDesc += `> لا يملك أي مهارات.\n`;
        }
        combatEmbed.setDescription(combatDesc);
        embeds['combat'] = combatEmbed;

        // دالة مساعدة لإنشاء إمبيد للأقسام الأخرى
        const createCategoryEmbed = (title, color, itemsArray, emptyMsg) => {
            const embed = new EmbedBuilder().setTitle(title).setColor(color).setThumbnail(targetUser.user.displayAvatarURL({ dynamic: true }));
            
            if (itemsArray.length === 0) {
                embed.setDescription(`> ${emptyMsg}`);
            } else {
                // تقسيم العناصر إذا كانت طويلة جداً
                let desc = "";
                itemsArray.forEach(item => {
                    if ((desc + item + "\n").length > 4000) return; // حماية من حد الديسكورد
                    desc += `> ${item}\n`;
                });
                embed.setDescription(desc);
            }
            return embed;
        };

        embeds['materials'] = createCategoryEmbed(`💎 موارد التطوير والخامات`, Colors.Purple, categories.materials, "الحقيبة فارغة من الخامات. افتح الصناديق للحصول عليها!");
        embeds['fishing'] = createCategoryEmbed(`🎣 معدات وصيد البحر`, Colors.Blue, categories.fishing, "لا يوجد أسماك أو معدات صيد هنا.");
        embeds['farming'] = createCategoryEmbed(`🌾 أدوات ومحاصيل المزرعة`, Colors.Green, categories.farming, "لا يوجد بذور أو محاصيل هنا.");
        embeds['others'] = createCategoryEmbed(`🎒 متفرقات أخرى`, Colors.Grey, categories.others, "لا توجد عناصر أخرى.");

        // ==========================================
        // 🎛️ بناء القائمة المنسدلة
        // ==========================================
        const menuRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`inventory_menu_${user.id}`)
                .setPlaceholder('تصفح أقسام الحقيبة...')
                .addOptions([
                    { label: 'الأسلحة والمهارات', value: 'combat', emoji: '⚔️', description: 'أسلحتك العرقية ومهاراتك السحرية' },
                    { label: 'موارد التطوير', value: 'materials', emoji: '💎', description: 'الخامات والكتب المستخرجة من الصناديق' },
                    { label: 'الصيد والأسماك', value: 'fishing', emoji: '🎣', description: 'أسماكك ومعدات الصيد' },
                    { label: 'المزرعة والزراعة', value: 'farming', emoji: '🌾', description: 'البذور، المحاصيل، وأعلاف الحيوانات' },
                    { label: 'متفرقات', value: 'others', emoji: '🎒', description: 'العناصر الأخرى غير المصنفة' }
                ])
        );

        // إرسال الصفحة الافتراضية (الأسلحة والمهارات)
        const msg = await reply({ embeds: [embeds['combat']], components: [menuRow] });

        // إعداد المستمع (Collector) للتنقل بين الصفحات
        const filter = i => i.user.id === user.id && i.customId === `inventory_menu_${user.id}`;
        const collector = msg.createMessageComponentCollector({ filter, time: 120000 });

        collector.on('collect', async (i) => {
            const selectedCategory = i.values[0];
            await i.update({ embeds: [embeds[selectedCategory]], components: [menuRow] });
        });

        collector.on('end', () => {
            try {
                menuRow.components[0].setDisabled(true);
                msg.edit({ components: [menuRow] }).catch(()=>{});
            } catch(e) {}
        });
    }
};
