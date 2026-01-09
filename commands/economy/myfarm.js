const { 
    EmbedBuilder, 
    Colors, 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ComponentType, 
    StringSelectMenuBuilder,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require("discord.js");

const farmAnimals = require('../../json/farm-animals.json');
const feedItems = require('../../json/feed-items.json');
const { getPlayerCapacity } = require('../../utils/farmUtils.js');

const EMOJI_MORA = '<:mora:1435647151349698621>';
const LEFT_EMOJI = '<:left:1439164494759723029>';
const RIGHT_EMOJI = '<:right:1439164491072929915>';
const ITEMS_PER_PAGE = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('مزرعتي')
        .setDescription('يعرض مزرعتك وحالة الحيوانات ومخزن الأعلاف.')
        .addUserOption(option => 
            option.setName('المستخدم')
            .setDescription('المستخدم الذي تريد عرض مزرعته')
            .setRequired(false)),

    name: 'myfarm',
    aliases: ['مزرعتي', 'حيواناتي'],
    category: "Economy",
    description: 'يعرض مزرعتك وحالة الحيوانات ومخزن الأعلاف.',
    usage: '-myfarm [@user]',

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, user;
        let targetMember;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            user = interaction.user;
            targetMember = interaction.options.getMember('المستخدم') || interaction.member;
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            user = message.author;
            targetMember = message.mentions.members.first() || message.member;
        }

        const reply = async (payload) => {
            if (isSlash) return interaction.editReply(payload);
            return message.channel.send(payload);
        };

        const sql = client.sql;
        const targetUser = targetMember.user;
        const userId = targetUser.id;
        const guildId = guild.id;
        const isOwner = user.id === userId; 

        // ============================================================
        // 💀 نظام الموت: فحص الجوع قبل عرض المزرعة
        // ============================================================
        const now = Date.now();
        const deadAnimals = [];
        
        const allUserAnimals = sql.prepare("SELECT * FROM user_farm WHERE userID = ? AND guildID = ?").all(userId, guildId);
        
        for (const row of allUserAnimals) {
            const animalDef = farmAnimals.find(a => String(a.id) === String(row.animalID));
            const maxHunger = animalDef ? (animalDef.max_hunger_days || 7) : 7;

            if (!row.lastFedTimestamp) {
                sql.prepare("UPDATE user_farm SET lastFedTimestamp = ? WHERE id = ?").run(now, row.id);
                continue;
            }

            const diff = now - row.lastFedTimestamp;
            const daysHungry = Math.floor(diff / DAY_MS);

            if (daysHungry >= maxHunger) {
                deadAnimals.push(`${row.quantity}x ${animalDef ? animalDef.name : 'حيوان مجهول'}`);
                sql.prepare("DELETE FROM user_farm WHERE id = ?").run(row.id);
            }
        }

        if (deadAnimals.length > 0 && isOwner) {
            const deathEmbed = new EmbedBuilder()
                .setTitle('☠️ لقد نفقت حيواناتك من الجوع!')
                .setDescription(`بسبب إهمالك وعدم إطعامها، خسرت:\n\n❌ **${deadAnimals.join('\n❌ ')}**`)
                .setColor(Colors.Red);
            
            const msgPayload = { embeds: [deathEmbed], flags: MessageFlags.Ephemeral };
            if (isSlash) await interaction.followUp(msgPayload);
            else message.reply(msgPayload);
        }

        // ============================================================
        // 🛠️ الدوال المساعدة للعرض
        // ============================================================

        const renderFarm = (page = 0) => {
            const maxCapacity = getPlayerCapacity(client, userId, guildId);
            const userAnimals = sql.prepare("SELECT * FROM user_farm WHERE userID = ? AND guildID = ? ORDER BY quantity DESC").all(userId, guildId);

            const baseEmbed = new EmbedBuilder()
                .setColor("Random")
                .setAuthor({ name: `🏞️ مزرعـــة ${targetUser.username}`, iconURL: targetUser.displayAvatarURL() });

            if (!userAnimals || userAnimals.length === 0) {
                baseEmbed.setDescription(`📦 **السعة:** [ \`0\` / \`${maxCapacity}\` ]\n\n🍂 **مـزرعـة فـارغـة**\nقم بشراء حيوانات لملء مزرعتك.`);
                baseEmbed.setImage('https://i.postimg.cc/65VKKCdP/dp2kuk914o9y-gif-1731-560.gif');
                return { embed: baseEmbed, rows: getFarmButtons(0, 0) };
            }

            let totalFarmIncome = 0;
            let currentCapacityUsed = 0;
            const animalsMap = new Map();

            for (const row of userAnimals) {
                const animalData = farmAnimals.find(a => String(a.id) === String(row.animalID));
                if (!animalData) continue; 
                
                const qty = row.quantity || 1;
                currentCapacityUsed += (qty * (animalData.size || 1));
                totalFarmIncome += (animalData.income_per_day * qty);

                const lastFed = row.lastFedTimestamp || now;
                const hungerDays = Math.floor((now - lastFed) / DAY_MS);
                
                const maxHunger = animalData.max_hunger_days || 7;
                const daysUntilDeath = Math.max(0, maxHunger - hungerDays);

                let hungerStatusText = `🟢 شبعان - ${daysUntilDeath} أيام متبقية`;
                if (daysUntilDeath <= 1) hungerStatusText = `🔴 على وشك الموت - يوم واحد متبقي!`;
                else if (daysUntilDeath <= Math.ceil(maxHunger / 2)) hungerStatusText = `🟡 بدأ يجوع - ${daysUntilDeath} أيام متبقية`;

                // حساب العمر
                const purchaseTime = row.purchaseTimestamp || now;
                const ageMS = now - purchaseTime;
                const ageDays = Math.floor(ageMS / DAY_MS);
                const lifeRemaining = Math.max(0, animalData.lifespan_days - ageDays);

                if (animalsMap.has(animalData.id)) {
                    const existing = animalsMap.get(animalData.id);
                    existing.quantity += qty;
                    existing.income += (animalData.income_per_day * qty);
                    if (daysUntilDeath < existing.minDays) {
                        existing.minDays = daysUntilDeath;
                        existing.hungerText = hungerStatusText;
                    }
                    if (ageDays > existing.age) {
                        existing.age = ageDays;
                        existing.lifeRemaining = lifeRemaining;
                    }
                } else {
                    animalsMap.set(animalData.id, {
                        ...animalData,
                        quantity: qty,
                        income: animalData.income_per_day * qty,
                        minDays: daysUntilDeath,
                        hungerText: hungerStatusText,
                        age: ageDays,
                        lifeRemaining: lifeRemaining
                    });
                }
            }

            const processedAnimals = Array.from(animalsMap.values());
            const totalPages = Math.ceil(processedAnimals.length / ITEMS_PER_PAGE);
            
            const start = page * ITEMS_PER_PAGE;
            const end = start + ITEMS_PER_PAGE;
            const currentItems = processedAnimals.slice(start, end);

            let header = currentCapacityUsed >= maxCapacity 
                ? `🚫 **المزرعة ممتلئة!**\n✶ السعة: [ \`${currentCapacityUsed}\` / \`${maxCapacity}\` ]\n💡 ارفع مستواك لزيادة السعة القصوى.\n\n`
                : `📦 **إحصائيات السعة:**\n✶ المساحة المستخدمة: [ \`${currentCapacityUsed}\` / \`${maxCapacity}\` ]\n\n`;

            const desc = currentItems.map(item => 
                `**✥ ${item.name} ${item.emoji}**\n` +
                `✶ الـعـدد: \`${item.quantity.toLocaleString()}\`\n` +
                `✶ الـدخـل اليومي: \`${item.income.toLocaleString()}\` ${EMOJI_MORA}\n` +
                `✥ حالـة الجـوع: ${item.hungerText}\n` +
                `✥ اقـدم حـيـوان عمـره: \`${item.age}\` يوم - متبقي \`${item.lifeRemaining}\` يوم`
            ).join('\n\n');

            baseEmbed.setDescription(header + desc);
            baseEmbed.setFooter({ text: `صفحة ${page + 1}/${totalPages} • الدخل اليومي: ${totalFarmIncome.toLocaleString()}`, iconURL: targetUser.displayAvatarURL() });
            baseEmbed.setImage('https://i.postimg.cc/65VKKCdP/dp2kuk914o9y-gif-1731-560.gif');

            return { embed: baseEmbed, rows: getFarmButtons(page, totalPages) };
        };

        const renderFeedStore = () => {
            const inventory = sql.prepare("SELECT * FROM user_inventory WHERE userID = ? AND guildID = ?").all(userId, guildId);
            const feedInventory = [];

            feedItems.forEach(feed => {
                const itemInInv = inventory.find(i => i.itemID === feed.id);
                if (itemInInv && itemInInv.quantity > 0) {
                    const targetAnimal = farmAnimals.find(a => a.feed_id === feed.id);
                    feedInventory.push({ 
                        ...feed, 
                        qty: itemInInv.quantity,
                        animalName: targetAnimal ? targetAnimal.name : 'مجهول',
                        animalEmoji: targetAnimal ? targetAnimal.emoji : '❓'
                    });
                }
            });

            const embed = new EmbedBuilder()
                .setTitle('✥ مـخـزن الاعلاف')
                .setColor('#D48950')
                .setImage('https://i.postimg.cc/qB6RDR0f/1000166519.gif');

            if (feedInventory.length === 0) {
                embed.setDescription("🚫 **المخزن فارغ!**\nقم بشراء الأعلاف لإطعام حيواناتك وإنقاذها من الموت.");
            } else {
                const list = feedInventory.map(f => 
                    `✶ ${f.emoji} **${f.name}** : \`${f.qty}\` ⬅️ لـ **${f.animalName}** ${f.animalEmoji}`
                ).join('\n\n');
                embed.setDescription(list);
            }

            return { embed, rows: getFeedStoreButtons() };
        };

        const getFarmButtons = (page, totalPages) => {
            const row = new ActionRowBuilder();
            if (totalPages > 1) {
                row.addComponents(
                    new ButtonBuilder().setCustomId('farm_prev').setEmoji(LEFT_EMOJI).setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
                    new ButtonBuilder().setCustomId('farm_next').setEmoji(RIGHT_EMOJI).setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1)
                );
            }
            if (isOwner) {
                row.addComponents(
                    new ButtonBuilder().setCustomId('open_feed_store').setLabel('مخـزن الاعـلاف').setStyle(ButtonStyle.Primary).setEmoji('🌾')
                );
            }
            return row.components.length > 0 ? [row] : [];
        };

        const getFeedStoreButtons = () => {
            return [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_feed_animal').setLabel('اطعـام').setStyle(ButtonStyle.Success).setEmoji('🥄'),
                new ButtonBuilder().setCustomId('btn_buy_feed').setLabel('شـراء').setStyle(ButtonStyle.Primary).setEmoji('🛒'),
                // ✅ زر البيع الجديد
                new ButtonBuilder().setCustomId('btn_sell_feed').setLabel('بيـع').setStyle(ButtonStyle.Danger).setEmoji('💰'),
                new ButtonBuilder().setCustomId('btn_back_farm').setLabel('رجـوع').setStyle(ButtonStyle.Secondary).setEmoji('↩️')
            )];
        };

        // ============================================================
        // 🚀 بدء العرض والتفاعل
        // ============================================================
        let currentPage = 0;
        let currentView = 'farm'; 

        const initialData = renderFarm(0);
        const msg = await reply({ embeds: [initialData.embed], components: initialData.rows, fetchReply: true });

        const collector = msg.createMessageComponentCollector({ 
            filter: i => i.user.id === user.id, 
            time: 300000 
        });

        collector.on('collect', async i => {
            if (i.customId === 'farm_prev') {
                currentPage--;
                const data = renderFarm(currentPage);
                await i.update({ embeds: [data.embed], components: data.rows });
            } 
            else if (i.customId === 'farm_next') {
                currentPage++;
                const data = renderFarm(currentPage);
                await i.update({ embeds: [data.embed], components: data.rows });
            }
            else if (i.customId === 'open_feed_store') {
                currentView = 'feed_store';
                const data = renderFeedStore();
                await i.update({ embeds: [data.embed], components: data.rows });
            }
            else if (i.customId === 'btn_back_farm') {
                currentView = 'farm';
                currentPage = 0;
                const data = renderFarm(0);
                await i.update({ embeds: [data.embed], components: data.rows });
            }
            
            // --- عرض قائمة الشراء ---
            else if (i.customId === 'btn_buy_feed') {
                const options = feedItems.map(f => ({
                    label: f.name,
                    description: `${f.price} مورا | ${f.description.substring(0, 50)}`,
                    value: f.id,
                    emoji: f.emoji
                }));
                const row = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId('menu_buy_feed').setPlaceholder('اختر العلف للشراء...').addOptions(options)
                );
                const response = await i.reply({ content: '🛒 **اختر نوع العلف:**', components: [row], flags: MessageFlags.Ephemeral, fetchReply: true });
                handleEphemeralMenu(response, 'buy');
            }

            // --- عرض قائمة البيع (الجديدة) ---
            else if (i.customId === 'btn_sell_feed') {
                const inventory = sql.prepare("SELECT * FROM user_inventory WHERE userID = ? AND guildID = ?").all(userId, guildId);
                const options = [];

                feedItems.forEach(feed => {
                    const itemInInv = inventory.find(i => i.itemID === feed.id);
                    if (itemInInv && itemInInv.quantity > 0) {
                        const sellPrice = Math.floor(feed.price * 0.5); // نصف السعر
                        options.push({
                            label: feed.name,
                            description: `بيع بـ: ${sellPrice} مورا | لديك: ${itemInInv.quantity}`,
                            value: feed.id,
                            emoji: feed.emoji
                        });
                    }
                });

                if (options.length === 0) return await i.reply({ content: '❌ ليس لديك أعلاف للبيع.', flags: MessageFlags.Ephemeral });

                const row = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId('menu_sell_feed').setPlaceholder('اختر العلف لبيعه...').addOptions(options)
                );
                const response = await i.reply({ content: '💰 **ماذا تريد أن تبيع؟**\n(سعر البيع هو 50% من سعر الشراء)', components: [row], flags: MessageFlags.Ephemeral, fetchReply: true });
                handleEphemeralMenu(response, 'sell');
            }
            
            // --- عرض قائمة الإطعام ---
            else if (i.customId === 'btn_feed_animal') {
                const userAnimalsRows = sql.prepare("SELECT animalID FROM user_farm WHERE userID = ? AND guildID = ?").all(userId, guildId);
                const distinctAnimalIds = [...new Set(userAnimalsRows.map(r => r.animalID))];

                const options = [];
                for (const animId of distinctAnimalIds) {
                    const animal = farmAnimals.find(a => String(a.id) === String(animId));
                    if (!animal) continue; 

                    const feed = feedItems.find(f => f.id === animal.feed_id);
                    options.push({
                        label: `إطعام ${animal.name}`,
                        description: `يتطلب: ${feed ? feed.name : 'علف غير معروف'}`,
                        value: animal.id,
                        emoji: animal.emoji
                    });
                }

                if (options.length === 0) return await i.reply({ content: '❌ لا تملك حيوانات.', flags: MessageFlags.Ephemeral });

                const row = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId('menu_feed_animal').setPlaceholder('اختر الحيوان لإطعامه...').addOptions(options)
                );
                const response = await i.reply({ content: '🥄 **من تريد إطعامه؟**', components: [row], flags: MessageFlags.Ephemeral, fetchReply: true });
                handleEphemeralMenu(response, 'feed');
            }
        });

        // ============================================================
        // 🧪 التعامل مع القوائم والمودالات
        // ============================================================
        const handleEphemeralMenu = async (interactionResponse, menuType) => {
            try {
                const subCollector = interactionResponse.createMessageComponentCollector({ 
                    componentType: ComponentType.StringSelect, 
                    time: 60000, 
                    max: 1 
                });

                subCollector.on('collect', async subI => {
                    // --- شراء علف ---
                    if (menuType === 'buy') {
                        const feedId = subI.values[0];
                        const feed = feedItems.find(f => f.id === feedId);
                        
                        const modal = new ModalBuilder()
                            .setCustomId(`modal_buy_feed_${feedId}`)
                            .setTitle(`شراء ${feed.name}`);

                        const input = new TextInputBuilder()
                            .setCustomId('feed_quantity')
                            .setLabel('الكمية المطلوبة')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('مثال: 10')
                            .setRequired(true);

                        modal.addComponents(new ActionRowBuilder().addComponents(input));
                        
                        await subI.showModal(modal);

                        try {
                            const modalSubmit = await subI.awaitModalSubmit({ time: 60000, filter: m => m.user.id === user.id });
                            
                            const qty = parseInt(modalSubmit.fields.getTextInputValue('feed_quantity'));
                            if (isNaN(qty) || qty <= 0) {
                                return modalSubmit.reply({ content: '❌ كمية غير صالحة.', flags: MessageFlags.Ephemeral });
                            }

                            const totalPrice = feed.price * qty;
                            let userData = client.getLevel.get(user.id, guild.id);
                            if (!userData) userData = { ...client.defaultData, user: user.id, guild: guild.id };

                            if (userData.mora < totalPrice) {
                                return modalSubmit.reply({ content: `❌ رصيد غير كافي! تحتاج **${totalPrice.toLocaleString()}** ${EMOJI_MORA}`, flags: MessageFlags.Ephemeral });
                            }

                            userData.mora -= totalPrice;
                            client.setLevel.run(userData);
                            
                            sql.prepare("INSERT INTO user_inventory (guildID, userID, itemID, quantity) VALUES (?, ?, ?, ?) ON CONFLICT(guildID, userID, itemID) DO UPDATE SET quantity = quantity + ?").run(guildId, userId, feed.id, qty, qty);
                            
                            await modalSubmit.reply({ content: `✅ تم شراء **${qty}x ${feed.name}** بنجاح!`, flags: MessageFlags.Ephemeral });

                            if (currentView === 'feed_store') {
                                const data = renderFeedStore();
                                await msg.edit({ embeds: [data.embed], components: data.rows });
                            }

                        } catch (err) {}
                    } 
                    
                    // --- بيع علف (جديد) ---
                    else if (menuType === 'sell') {
                        const feedId = subI.values[0];
                        const feed = feedItems.find(f => f.id === feedId);
                        
                        const modal = new ModalBuilder()
                            .setCustomId(`modal_sell_feed_${feedId}`)
                            .setTitle(`بيع ${feed.name}`);

                        const input = new TextInputBuilder()
                            .setCustomId('sell_quantity')
                            .setLabel('الكمية المراد بيعها')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('مثال: 5')
                            .setRequired(true);

                        modal.addComponents(new ActionRowBuilder().addComponents(input));
                        await subI.showModal(modal);

                        try {
                            const modalSubmit = await subI.awaitModalSubmit({ time: 60000, filter: m => m.user.id === user.id });
                            const qty = parseInt(modalSubmit.fields.getTextInputValue('sell_quantity'));
                            
                            if (isNaN(qty) || qty <= 0) {
                                return modalSubmit.reply({ content: '❌ كمية غير صالحة.', flags: MessageFlags.Ephemeral });
                            }

                            // التحقق من الملكية
                            const itemInInv = sql.prepare("SELECT quantity FROM user_inventory WHERE userID = ? AND guildID = ? AND itemID = ?").get(userId, guildId, feedId);
                            if (!itemInInv || itemInInv.quantity < qty) {
                                return modalSubmit.reply({ content: `❌ لا تملك هذه الكمية! لديك: ${itemInInv ? itemInInv.quantity : 0}`, flags: MessageFlags.Ephemeral });
                            }

                            const sellPrice = Math.floor(feed.price * 0.5); // نصف السعر
                            const totalEarned = sellPrice * qty;

                            let userData = client.getLevel.get(user.id, guild.id);
                            if (!userData) userData = { ...client.defaultData, user: user.id, guild: guild.id };

                            userData.mora += totalEarned;
                            client.setLevel.run(userData);

                            // تحديث المخزون
                            if (itemInInv.quantity === qty) {
                                sql.prepare("DELETE FROM user_inventory WHERE userID = ? AND guildID = ? AND itemID = ?").run(userId, guildId, feedId);
                            } else {
                                sql.prepare("UPDATE user_inventory SET quantity = quantity - ? WHERE userID = ? AND guildID = ? AND itemID = ?").run(qty, userId, guildId, feedId);
                            }

                            await modalSubmit.reply({ content: `✅ تم بيع **${qty}x ${feed.name}** وحصلت على **${totalEarned}** ${EMOJI_MORA}`, flags: MessageFlags.Ephemeral });

                            if (currentView === 'feed_store') {
                                const data = renderFeedStore();
                                await msg.edit({ embeds: [data.embed], components: data.rows });
                            }

                        } catch (err) {}
                    }

                    // --- إطعام حيوان ---
                    else if (menuType === 'feed') {
                        const animalId = subI.values[0];
                        const animal = farmAnimals.find(a => String(a.id) === String(animalId));
                        const feedId = animal.feed_id;
                        const feed = feedItems.find(f => f.id === feedId);
                        
                        // 🛑 الحماية: فحص آخر وجبة
                        const sampleAnimal = sql.prepare("SELECT lastFedTimestamp FROM user_farm WHERE userID = ? AND guildID = ? AND animalID = ? LIMIT 1").get(userId, guildId, animalId);
                        
                        if (sampleAnimal && sampleAnimal.lastFedTimestamp) {
                            const hoursSinceLastFed = (Date.now() - sampleAnimal.lastFedTimestamp) / (1000 * 60 * 60);
                            if (hoursSinceLastFed < 12) {
                                return subI.reply({ content: `✋ **${animal.name}** شبع حالياً!\nيمكنك إطعامهم مرة كل 12 ساعة فقط.`, flags: MessageFlags.Ephemeral });
                            }
                        }

                        const countRow = sql.prepare("SELECT SUM(quantity) as total FROM user_farm WHERE userID = ? AND guildID = ? AND animalID = ?").get(userId, guildId, animalId);
                        const totalAnimals = countRow ? countRow.total : 0;
                        const invRow = sql.prepare("SELECT quantity FROM user_inventory WHERE userID = ? AND guildID = ? AND itemID = ?").get(userId, guildId, feedId);
                        const userFeedQty = invRow ? invRow.quantity : 0;

                        if (userFeedQty < totalAnimals) {
                            return subI.reply({ content: `❌ **علف غير كافي!** تحتاج **${totalAnimals}** ${feed.name}.`, flags: MessageFlags.Ephemeral });
                        }

                        sql.prepare("UPDATE user_inventory SET quantity = quantity - ? WHERE userID = ? AND guildID = ? AND itemID = ?").run(totalAnimals, userId, guildId, feedId);
                        sql.prepare("UPDATE user_farm SET lastFedTimestamp = ? WHERE userID = ? AND guildID = ? AND animalID = ?").run(Date.now(), userId, guildId, animalId);

                        await subI.reply({ content: `✅ **تم إطعام ${totalAnimals} ${animal.name}!**`, flags: MessageFlags.Ephemeral });
                        
                        if (currentView === 'feed_store') {
                            const data = renderFeedStore();
                            await msg.edit({ embeds: [data.embed], components: data.rows });
                        } else {
                            const data = renderFarm(currentPage);
                            await msg.edit({ embeds: [data.embed], components: data.rows });
                        }
                    }
                });
            } catch (e) { console.error(e); }
        };

        collector.on('end', () => {
            if (msg.editable) msg.edit({ components: [] }).catch(() => {});
        });
    }
};
