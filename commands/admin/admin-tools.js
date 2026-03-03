const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, Colors, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const shopItems = require('../../json/shop-items.json');
const farmAnimals = require('../../json/farm-animals.json');
const marketItems = require('../../json/market-items.json');
const questsConfig = require('../../json/quests-config.json');
const weaponsConfig = require('../../json/weapons-config.json');
const skillsConfig = require('../../json/skills-config.json');

const EMOJI_MORA = '<:mora:1435647151349698621>';
const REAL_MARKET_IDS = ['APPLE', 'ANDROID', 'TESLA', 'GOLD', 'LAND', 'BITCOIN', 'SPACEX', 'SILVER', 'ART'];

function getWeekStartDateString() {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); 
    const diff = now.getUTCDate() - (dayOfWeek + 2) % 7; 
    const friday = new Date(now.setUTCDate(diff));
    friday.setUTCHours(0, 0, 0, 0); 
    return friday.toISOString().split('T')[0];
}

function getTodayDateString() {
    return new Date().toISOString().split('T')[0];
}

function normalize(str) {
    if (!str) return "";
    return str.toString().toLowerCase()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ي/g, 'ى')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي')
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

module.exports = {
    name: 'admin-tools',
    description: 'لـوحـة الامبراطـور',
    aliases: ['ادمن', 'admin', 'تعديل-ادمن', 'ادوات-ادمن', 'control'],
    category: 'Admin',

    async execute(message, args) {
        const client = message.client;
        const sql = client.sql;

        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return; 

        try { sql.prepare("ALTER TABLE settings ADD COLUMN marketStatus TEXT DEFAULT 'normal'").run(); } catch (e) {}

        if (args[0] && (args[0].toLowerCase() === 'سوق' || args[0].toLowerCase() === 'market')) {
            return this.sendMarketPanel(message, sql);
        }

        const targetUser = message.mentions.users.first() || client.users.cache.get(args[0]);

        if (!targetUser) {
            const embed = new EmbedBuilder()
                .setTitle('🛠️ لوحة تحكم الإمبراطورية')
                .setColor(Colors.DarkGrey)
                .setDescription("لإدارة عضو معين:\n`-ادمن @منشن`\n\nلإدارة الاقتصاد والسوق:\n`-ادمن سوق`");
            return message.reply({ embeds: [embed] });
        }

        const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) return message.reply("❌ العضو غير موجود في السيرفر.");

        await this.sendUserPanel(message, targetUser, targetMember, sql, client);
    },

    async sendUserPanel(message, targetUser, targetMember, sql, client) {
        const embed = new EmbedBuilder()
            .setTitle(`👑 لـوحـة الامبراطـور: ${targetUser.username}`)
            .setThumbnail(targetUser.displayAvatarURL())
            .setColor(Colors.Gold)
            .setDescription("مـا امـرك سيـادة الامبراطـور؟");

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`admin_user_${targetUser.id}`)
                .setPlaceholder('اختر الإجراء...')
                .addOptions([
                    { label: '📋 فحص الحساب', value: 'check', description: 'عرض إحصائيات اللاعب' },
                    { label: '💰 إدارة المورا والخبرة', value: 'economy', emoji: '🪙' },
                    { label: '🌟 إدارة السمعة', value: 'reputation', description: 'إضافة/خصم/تحديد نقاط السمعة', emoji: '🌟' },
                    { label: '🗳️ فرص التزكية', value: 'rep_chances', description: 'منح فرص تصويت (تزكية) إضافية لليوم', emoji: '🗳️' },
                    { label: '🎟️ إدارة التذاكر', value: 'tickets', emoji: '🎟️' },
                    { label: '⛺ منح خيمة (دانجون)', value: 'dungeon_tent', description: 'تحديد طابق الحفظ في الدانجون', emoji: '⛺' },
                    { label: '🎒 إدارة العناصر', value: 'items', description: 'إعطاء/سحب الأغراض', emoji: '🎒' },
                    { label: '🛡️ إعطاء درع ميديا', value: 'media_shield', emoji: '🛡️' },
                    { label: '⚠️ تصفير الحساب', value: 'reset', description: 'مسح جميع البيانات!', emoji: '⚠️' }
                ])
        );

        const panelMsg = await message.reply({ embeds: [embed], components: [row] });
        const filter = i => i.user.id === message.author.id;
        const collector = panelMsg.createMessageComponentCollector({ filter, time: 300000 });

        collector.on('collect', async interaction => {
            const val = interaction.values[0];
            const guildID = message.guild.id;
            const userID = targetUser.id;

            if (val === 'check') {
                await this.checkUser(interaction, client, sql, targetUser);
            } 
            else if (val === 'economy') {
                const modalId = `mod_eco_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('إدارة الموارد');
                const typeInput = new TextInputBuilder().setCustomId('eco_type').setLabel('النوع (مورا / خبرة)').setStyle(TextInputStyle.Short).setRequired(true);
                const actionInput = new TextInputBuilder().setCustomId('eco_action').setLabel('الإجراء (اضافة / خصم / تحديد)').setStyle(TextInputStyle.Short).setRequired(true);
                const amountInput = new TextInputBuilder().setCustomId('eco_amount').setLabel('الكمية (أرقام فقط)').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(typeInput), new ActionRowBuilder().addComponents(actionInput), new ActionRowBuilder().addComponents(amountInput));
                await interaction.showModal(modal);

                try {
                    const modalSubmit = await interaction.awaitModalSubmit({ filter: i => i.customId === modalId && i.user.id === message.author.id, time: 120000 });
                    const type = normalize(modalSubmit.fields.getTextInputValue('eco_type'));
                    const action = normalize(modalSubmit.fields.getTextInputValue('eco_action'));
                    const amount = parseInt(modalSubmit.fields.getTextInputValue('eco_amount'));
                    
                    if (isNaN(amount)) return modalSubmit.reply({ content: "❌ الرجاء إدخال رقم صحيح.", ephemeral: true });
                    let ud = client.getLevel.get(userID, guildID) || { ...client.defaultData, user: userID, guild: guildID };
                    let field = type.includes('مورا') || type.includes('فلوس') ? 'mora' : 'xp';
                    
                    if (action.includes('اضاف')) ud[field] += amount;
                    else if (action.includes('خصم')) ud[field] = Math.max(0, ud[field] - amount);
                    else if (action.includes('تحديد')) ud[field] = amount;

                    client.setLevel.run(ud);
                    await modalSubmit.reply({ content: `✅ تم تعديل اقتصاد ${targetUser} بنجاح.` });
                } catch(e) { if (e.code !== 'InteractionCollectorError') console.error(e); }
            }
            else if (val === 'reputation') {
                const modalId = `mod_rep_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('إدارة السمعة (النقاط)');
                const actionInput = new TextInputBuilder().setCustomId('rep_action').setLabel('الإجراء (اضافة / خصم / تحديد)').setStyle(TextInputStyle.Short).setRequired(true);
                const amountInput = new TextInputBuilder().setCustomId('rep_amount').setLabel('النقاط (أرقام فقط)').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(actionInput), new ActionRowBuilder().addComponents(amountInput));
                await interaction.showModal(modal);

                try {
                    const modalSubmit = await interaction.awaitModalSubmit({ filter: i => i.customId === modalId && i.user.id === message.author.id, time: 120000 });
                    const action = normalize(modalSubmit.fields.getTextInputValue('rep_action'));
                    const amount = parseInt(modalSubmit.fields.getTextInputValue('rep_amount'));
                    if (isNaN(amount)) return modalSubmit.reply({ content: "❌ الرجاء إدخال رقم صحيح.", ephemeral: true });

                    let repData = sql.prepare("SELECT * FROM user_reputation WHERE userID = ? AND guildID = ?").get(userID, guildID);
                    if (!repData) {
                        sql.prepare("INSERT INTO user_reputation (userID, guildID) VALUES (?, ?)").run(userID, guildID);
                        repData = { rep_points: 0 };
                    }

                    let newPoints = repData.rep_points;
                    if (action.includes('اضاف') || action.includes('زود')) newPoints += amount;
                    else if (action.includes('خصم') || action.includes('نقص') || action.includes('ازال')) newPoints = Math.max(0, newPoints - amount);
                    else if (action.includes('تحديد') || action.includes('حط')) newPoints = amount;
                    else return modalSubmit.reply({ content: "❌ إجراء غير معروف.", ephemeral: true });

                    sql.prepare("UPDATE user_reputation SET rep_points = ? WHERE userID = ? AND guildID = ?").run(newPoints, userID, guildID);
                    await modalSubmit.reply({ content: `✅ تم ضبط سمعة ${targetUser} لتصبح **${newPoints}** 🌟` });
                } catch(e) { if (e.code !== 'InteractionCollectorError') console.error(e); }
            }
            else if (val === 'rep_chances') {
                const modalId = `mod_repchan_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('منح فرص تزكية');
                const amountInput = new TextInputBuilder().setCustomId('repchan_amount').setLabel('عدد الفرص الإضافية (أرقام فقط)').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
                await interaction.showModal(modal);

                try {
                    const modalSubmit = await interaction.awaitModalSubmit({ filter: i => i.customId === modalId && i.user.id === message.author.id, time: 120000 });
                    const amount = parseInt(modalSubmit.fields.getTextInputValue('repchan_amount'));
                    if (isNaN(amount) || amount <= 0) return modalSubmit.reply({ content: "❌ الرجاء إدخال رقم صحيح وموجب.", ephemeral: true });

                    const todayDateStr = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Riyadh' });
                    try { sql.prepare("ALTER TABLE user_reputation ADD COLUMN daily_reps_given INTEGER DEFAULT 0").run(); } catch(e) {}

                    let repData = sql.prepare("SELECT * FROM user_reputation WHERE userID = ? AND guildID = ?").get(userID, guildID);
                    if (!repData) {
                        sql.prepare("INSERT INTO user_reputation (userID, guildID, last_rep_given, daily_reps_given) VALUES (?, ?, ?, ?)").run(userID, guildID, todayDateStr, -amount);
                    } else {
                        sql.prepare("UPDATE user_reputation SET last_rep_given = ?, daily_reps_given = COALESCE(daily_reps_given, 0) - ? WHERE userID = ? AND guildID = ?").run(todayDateStr, amount, userID, guildID);
                    }

                    await modalSubmit.reply({ content: `✅ تم منح **${amount}** فرصة تزكية إضافية لـ ${targetUser} بنجاح! يمكنه استخدامها الآن. 🗳️` });
                } catch(e) { if (e.code !== 'InteractionCollectorError') console.error(e); }
            }
            else if (val === 'tickets') {
                const modalId = `mod_tkt_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('إدارة تذاكر الدانجون');
                const amountInput = new TextInputBuilder().setCustomId('tkt_amount').setLabel('الكمية للإضافة').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
                await interaction.showModal(modal);

                try {
                    const modalSubmit = await interaction.awaitModalSubmit({ filter: i => i.customId === modalId && i.user.id === message.author.id, time: 120000 });
                    const amount = parseInt(modalSubmit.fields.getTextInputValue('tkt_amount'));
                    if (isNaN(amount)) return modalSubmit.reply({ content: "❌ الرجاء إدخال رقم صحيح.", ephemeral: true });

                    const userStats = sql.prepare("SELECT * FROM dungeon_stats WHERE userID = ? AND guildID = ?").get(userID, guildID);
                    if (userStats) {
                        sql.prepare("UPDATE dungeon_stats SET tickets = tickets + ? WHERE userID = ? AND guildID = ?").run(amount, userID, guildID);
                    } else {
                        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
                        sql.prepare("INSERT INTO dungeon_stats (guildID, userID, tickets, last_reset) VALUES (?, ?, ?, ?)").run(guildID, userID, amount, todayStr);
                    }
                    await modalSubmit.reply({ content: `✅ تم إضافة **${amount}** 🎟️ تذاكر لـ ${targetUser}.` });
                } catch(e) { if (e.code !== 'InteractionCollectorError') console.error(e); }
            }
            // 🔥 تنفيذ خيمة الدانجون السحرية (النسخة المصححة) 🔥
            else if (val === 'dungeon_tent') {
                const modalId = `mod_tent_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('منح خيمة حفظ (الدانجون)');
                const floorInput = new TextInputBuilder().setCustomId('tent_floor').setLabel('رقم الطابق المراد الحفظ عنده').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(floorInput));
                await interaction.showModal(modal);

                try {
                    const modalSubmit = await interaction.awaitModalSubmit({ filter: i => i.customId === modalId && i.user.id === message.author.id, time: 120000 });
                    const floorStr = modalSubmit.fields.getTextInputValue('tent_floor');
                    const targetFloor = parseInt(floorStr);
                    
                    if (isNaN(targetFloor) || targetFloor <= 0) {
                        return modalSubmit.reply({ content: "❌ الرجاء إدخال رقم طابق صحيح وموجب.", ephemeral: true });
                    }

                    try {
                        // 🔥 التصحيح المعتمد: استخدام hostID و floor ليتطابق مع الداتابيس
                        const existingSave = sql.prepare("SELECT * FROM dungeon_saves WHERE hostID = ? AND guildID = ?").get(userID, guildID);
                        
                        if (existingSave) {
                            sql.prepare("UPDATE dungeon_saves SET floor = ?, timestamp = ? WHERE hostID = ? AND guildID = ?").run(targetFloor, Date.now(), userID, guildID);
                        } else {
                            sql.prepare("INSERT INTO dungeon_saves (hostID, guildID, floor, timestamp) VALUES (?, ?, ?, ?)").run(userID, guildID, targetFloor, Date.now());
                        }
                        
                        await modalSubmit.reply({ content: `⛺ ✅ تم منح خيمة سحرية لـ ${targetUser}!\nسيتم استكمال رحلته في الدانجون من **الطابق ${targetFloor}**.` });
                    } catch (dbError) {
                        console.error("[Dungeon Tent Error]:", dbError);
                        await modalSubmit.reply({ content: `❌ حدث خطأ برمجي أثناء حفظ الخيمة:\n\`${dbError.message}\``, ephemeral: true });
                    }
                } catch(e) { if (e.code !== 'InteractionCollectorError') console.error(e); }
            }
            else if (val === 'items') {
                const modalId = `mod_item_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('إدارة العناصر');
                const actionInput = new TextInputBuilder().setCustomId('itm_action').setLabel('الإجراء (اعطاء / ازالة)').setStyle(TextInputStyle.Short).setRequired(true);
                const nameInput = new TextInputBuilder().setCustomId('itm_name').setLabel('اسم العنصر').setStyle(TextInputStyle.Short).setRequired(true);
                const qtyInput = new TextInputBuilder().setCustomId('itm_qty').setLabel('الكمية').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(actionInput), new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(qtyInput));
                await interaction.showModal(modal);

                try {
                    const modalSubmit = await interaction.awaitModalSubmit({ filter: i => i.customId === modalId && i.user.id === message.author.id, time: 120000 });
                    const action = normalize(modalSubmit.fields.getTextInputValue('itm_action'));
                    const name = modalSubmit.fields.getTextInputValue('itm_name');
                    const qty = parseInt(modalSubmit.fields.getTextInputValue('itm_qty')) || 1;

                    const item = this.findItem(name);
                    if (!item) return modalSubmit.reply({ content: `❌ لم يتم العثور على عنصر باسم "${name}".`, ephemeral: true });

                    if (action.includes('اعطاء') || action.includes('اضاف')) {
                        if (item.type === 'market') {
                            const pfItem = sql.prepare("SELECT * FROM user_portfolio WHERE userID = ? AND guildID = ? AND itemID = ?").get(userID, guildID, item.id);
                            if (pfItem) sql.prepare("UPDATE user_portfolio SET quantity = quantity + ? WHERE id = ?").run(qty, pfItem.id);
                            else sql.prepare("INSERT INTO user_portfolio (guildID, userID, itemID, quantity) VALUES (?, ?, ?, ?)").run(guildID, userID, item.id, qty);
                        } else if (item.type === 'farm') {
                            const now = Date.now();
                            const stmt = sql.prepare("INSERT INTO user_farm (guildID, userID, animalID, purchaseTimestamp, lastCollected, lastFedTimestamp) VALUES (?, ?, ?, ?, ?, ?)");
                            for (let i = 0; i < qty; i++) stmt.run(guildID, userID, item.id, now, now, now);
                        }
                        await modalSubmit.reply({ content: `✅ تم إضافة **${qty}** × **${item.name}** لـ ${targetUser}.` });
                    } 
                    else if (action.includes('ازال') || action.includes('سحب')) {
                        if (item.type === 'market') {
                            const pfItem = sql.prepare("SELECT * FROM user_portfolio WHERE userID = ? AND guildID = ? AND itemID = ?").get(userID, guildID, item.id);
                            if (!pfItem) return modalSubmit.reply({ content: "❌ لا يمتلك هذا العنصر.", ephemeral: true });
                            if (pfItem.quantity - qty <= 0) sql.prepare("DELETE FROM user_portfolio WHERE id = ?").run(pfItem.id);
                            else sql.prepare("UPDATE user_portfolio SET quantity = quantity - ? WHERE id = ?").run(qty, pfItem.id);
                        } else if (item.type === 'farm') {
                            const animals = sql.prepare("SELECT id FROM user_farm WHERE userID = ? AND guildID = ? AND animalID = ? LIMIT ?").all(userID, guildID, item.id, qty);
                            animals.forEach(a => sql.prepare("DELETE FROM user_farm WHERE id = ?").run(a.id));
                        }
                        await modalSubmit.reply({ content: `✅ تم سحب **${qty}** × **${item.name}** من ${targetUser}.` });
                    }
                } catch(e) { if (e.code !== 'InteractionCollectorError') console.error(e); }
            }
            else if (val === 'media_shield') {
                await this.giveMediaShield(interaction, sql, targetUser);
            }
            else if (val === 'reset') {
                await this.resetUser(interaction, client, sql, targetUser);
            }
        });
    },

    async sendMarketPanel(message, sql) {
        const embed = new EmbedBuilder()
            .setTitle(`📈 لوحة تحكم اقتصاد السيرفر`)
            .setColor(Colors.DarkVividPink)
            .setDescription("الرجاء اختيار الإجراء المطلوب للسوق:");

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`admin_market_${message.guild.id}`)
                .setPlaceholder('اختر الإجراء...')
                .addOptions([
                    { label: '📉 افتعال انهيار', value: 'crash' },
                    { label: '📈 افتعال انتعاش', value: 'boom' },
                    { label: '⚖️ تعديل حالة السوق', value: 'status', description: 'ركود / ازدهار / طبيعي' },
                    { label: '✏️ تحديد سعر سهم', value: 'price' },
                    { label: '☢️ تصفير السوق الإجباري', value: 'reset_market' }
                ])
        );

        const panelMsg = await message.reply({ embeds: [embed], components: [row] });
        const filter = i => i.user.id === message.author.id;
        const collector = panelMsg.createMessageComponentCollector({ filter, time: 300000 });

        collector.on('collect', async interaction => {
            const val = interaction.values[0];

            if (val === 'crash') {
                const allItems = sql.prepare("SELECT * FROM market_items").all();
                const updateStmt = sql.prepare("UPDATE market_items SET currentPrice = ?, lastChangePercent = ? WHERE id = ?");
                let report = [];
                for (const item of allItems) {
                    if (!REAL_MARKET_IDS.includes(item.id)) continue;
                    const dropPercent = (Math.random() * 0.20) + 0.20; 
                    const newPrice = Math.max(10, Math.floor(item.currentPrice * (1 - dropPercent)));
                    const changePercent = ((newPrice - item.currentPrice) / item.currentPrice);
                    updateStmt.run(newPrice, changePercent.toFixed(2), item.id);
                    report.push(`${item.name}: ${item.currentPrice} ➔ ${newPrice}`);
                }
                await interaction.reply({ content: `📉 **انهيار السوق!**\n\`\`\`\n${report.join('\n')}\n\`\`\`` });
            }
            else if (val === 'boom') {
                const allItems = sql.prepare("SELECT * FROM market_items").all();
                const updateStmt = sql.prepare("UPDATE market_items SET currentPrice = ?, lastChangePercent = ? WHERE id = ?");
                let report = [];
                for (const item of allItems) {
                    if (!REAL_MARKET_IDS.includes(item.id)) continue;
                    const risePercent = (Math.random() * 0.20) + 0.15; 
                    const newPrice = Math.floor(item.currentPrice * (1 + risePercent));
                    const changePercent = ((newPrice - item.currentPrice) / item.currentPrice);
                    updateStmt.run(newPrice, changePercent.toFixed(2), item.id);
                    report.push(`${item.name}: ${item.currentPrice} ➔ ${newPrice}`);
                }
                await interaction.reply({ content: `📈 **انتعاش السوق!**\n\`\`\`\n${report.join('\n')}\n\`\`\`` });
            }
            else if (val === 'status') {
                const modalId = `mod_mrkt_status_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('حالة السوق');
                const statInput = new TextInputBuilder().setCustomId('m_status').setLabel('اكتب: ركود أو ازدهار أو طبيعي').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(statInput));
                await interaction.showModal(modal);

                try {
                    const modalSubmit = await interaction.awaitModalSubmit({ filter: i => i.customId === modalId && i.user.id === message.author.id, time: 120000 });
                    const status = normalize(modalSubmit.fields.getTextInputValue('m_status'));
                    let statusKey = 'normal';
                    if (status.includes('ركود')) statusKey = 'recession';
                    if (status.includes('ازدهار')) statusKey = 'boom';
                    
                    sql.prepare("INSERT OR IGNORE INTO settings (guild) VALUES (?)").run(message.guild.id);
                    sql.prepare("UPDATE settings SET marketStatus = ? WHERE guild = ?").run(statusKey, message.guild.id);
                    await modalSubmit.reply({ content: `✅ تم ضبط حالة السوق على: **${statusKey}**` });
                } catch(e) { if (e.code !== 'InteractionCollectorError') console.error(e); }
            }
            else if (val === 'price') {
                const modalId = `mod_mrkt_price_${Date.now()}`;
                const modal = new ModalBuilder().setCustomId(modalId).setTitle('تحديد السعر');
                const nameInput = new TextInputBuilder().setCustomId('m_name').setLabel('اسم السهم أو الكود').setStyle(TextInputStyle.Short).setRequired(true);
                const priceInput = new TextInputBuilder().setCustomId('m_price').setLabel('السعر الجديد').setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(priceInput));
                await interaction.showModal(modal);

                try {
                    const modalSubmit = await interaction.awaitModalSubmit({ filter: i => i.customId === modalId && i.user.id === message.author.id, time: 120000 });
                    const itemID = modalSubmit.fields.getTextInputValue('m_name');
                    const price = parseInt(modalSubmit.fields.getTextInputValue('m_price'));
                    
                    const item = this.findItem(itemID);
                    if (!item || item.type !== 'market') return modalSubmit.reply({ content: "❌ السهم غير موجود.", ephemeral: true });

                    const dbItem = sql.prepare("SELECT * FROM market_items WHERE id = ?").get(item.id);
                    const currentPrice = dbItem ? dbItem.currentPrice : item.price;
                    const changePercent = ((price - currentPrice) / currentPrice).toFixed(2);
                    sql.prepare("UPDATE market_items SET currentPrice = ?, lastChangePercent = ? WHERE id = ?").run(price, changePercent, item.id);

                    await modalSubmit.reply({ content: `✅ تم ضبط سعر **${item.name}** إلى **${price}**` });
                } catch(e) { if (e.code !== 'InteractionCollectorError') console.error(e); }
            }
            else if (val === 'reset_market') {
                await interaction.reply({ content: "☢️ سيتم تنفيذ تصفير السوق يدوياً، يرجى كتابة `-ادمن تصفير-السوق` للتأكيد." });
            }
        });
    },

    async checkUser(interaction, client, sql, targetUser) {
        const guildID = interaction.guild.id;
        const userID = targetUser.id;

        const userData = client.getLevel.get(userID, guildID) || {};
        const streakData = sql.prepare("SELECT * FROM streaks WHERE guildID = ? AND userID = ?").get(guildID, userID) || {};
        const mediaStreakData = sql.prepare("SELECT * FROM media_streaks WHERE guildID = ? AND userID = ?").get(guildID, userID) || {};
        const repData = sql.prepare("SELECT rep_points FROM user_reputation WHERE guildID = ? AND userID = ?").get(guildID, userID) || { rep_points: 0 };
        const portfolio = sql.prepare("SELECT * FROM user_portfolio WHERE guildID = ? AND userID = ?").all(guildID, userID);
        const achievements = sql.prepare("SELECT achievementID FROM user_achievements WHERE guildID = ? AND userID = ?").all(guildID, userID);
        
        const dungeonStats = sql.prepare("SELECT tickets FROM dungeon_stats WHERE guildID = ? AND userID = ?").get(guildID, userID);
        const tickets = dungeonStats ? dungeonStats.tickets : 0;

        const embed = new EmbedBuilder()
            .setTitle(`📋 تقرير فحص: ${targetUser.username}`)
            .setThumbnail(targetUser.displayAvatarURL())
            .setColor(Colors.Green)
            .addFields(
                { name: '💰 الاقتصاد', value: `مورا: **${(userData.mora || 0).toLocaleString()}**\nبنك: **${(userData.bank || 0).toLocaleString()}**\nXP: **${(userData.xp || 0).toLocaleString()}** (Lv. ${userData.level || 1})`, inline: true },
                { name: '🌟 السمعة والتذاكر', value: `السمعة: **${repData.rep_points}**\nالتذاكر: **${tickets}**`, inline: true },
                { name: '🔥 الستريك', value: `شات: **${streakData.streakCount || 0}** (Shield: ${streakData.hasItemShield ? '✅' : '❌'})\nميديا: **${mediaStreakData.streakCount || 0}** (Shield: ${mediaStreakData.hasItemShield ? '✅' : '❌'})`, inline: true },
                { name: '📈 المحفظة', value: portfolio.length > 0 ? portfolio.map(p => `${p.itemID}: ${p.quantity}`).join(', ') : 'لا يوجد', inline: false },
                { name: '🏆 الإنجازات', value: `مكتمل: **${achievements.length}**`, inline: true }
            );

        await interaction.reply({ embeds: [embed] });
    },

    async giveMediaShield(interaction, client, sql, targetUser) {
        const id = `${interaction.guild.id}-${targetUser.id}`;
        sql.prepare(`INSERT INTO media_streaks (id, guildID, userID, hasItemShield) VALUES (?, ?, ?, 1) ON CONFLICT(id) DO UPDATE SET hasItemShield = 1`).run(id, interaction.guild.id, targetUser.id);
        await interaction.reply({ content: `✅ تم تفعيل درع ميديا لـ ${targetUser}.` });
    },

    async resetUser(interaction, client, sql, targetUser) {
        const guildID = interaction.guild.id;
        const userID = targetUser.id;

        sql.prepare("DELETE FROM levels WHERE user = ? AND guild = ?").run(userID, guildID);
        sql.prepare("DELETE FROM user_portfolio WHERE userID = ? AND guildID = ?").run(userID, guildID);
        sql.prepare("DELETE FROM user_farm WHERE userID = ? AND guildID = ?").run(userID, guildID);
        sql.prepare("DELETE FROM user_achievements WHERE userID = ? AND guildID = ?").run(userID, guildID);
        sql.prepare("DELETE FROM user_reputation WHERE userID = ? AND guildID = ?").run(userID, guildID);
        client.setLevel.run({ ...client.defaultData, user: userID, guild: guildID });

        await interaction.reply({ content: `☢️ **تم تصفير حساب ${targetUser} بالكامل!**` });
    },

    findItem(nameOrID) {
        const input = normalize(nameOrID);
        let item = shopItems.find(i => normalize(i.name) === input || i.id.toLowerCase() === nameOrID.toLowerCase());
        if (item && !marketItems.some(m => m.id === item.id) && !farmAnimals.some(f => f.id === item.id)) return { ...item, type: 'shop_special' };
        item = marketItems.find(i => normalize(i.name) === input || i.id.toLowerCase() === nameOrID.toLowerCase());
        if (item) return { ...item, type: 'market' };
        item = farmAnimals.find(i => normalize(i.name) === input || i.id.toLowerCase() === nameOrID.toLowerCase());
        if (item) return { ...item, type: 'farm' };
        return null;
    }
};
