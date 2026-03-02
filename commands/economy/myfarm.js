const { EmbedBuilder, Colors, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, StringSelectMenuBuilder, MessageFlags } = require("discord.js");

const farmAnimals = require('../../json/farm-animals.json');
const feedItems = require('../../json/feed-items.json');
const { getPlayerCapacity } = require('../../utils/farmUtils.js');
const { renderLand } = require('../../handlers/farm-land.js');

const EMOJI_MORA = '<:mora:1435647151349698621>';
const LEFT_EMOJI = '<:left:1439164494759723029>';
const RIGHT_EMOJI = '<:right:1439164491072929915>';
const ITEMS_PER_PAGE = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('مزرعتي')
        .setDescription('يعرض مزرعتك وحالة الحيوانات ومخزن الأعلاف والأراضي.')
        .addUserOption(option => 
            option.setName('المستخدم')
            .setDescription('المستخدم الذي تريد عرض مزرعته')
            .setRequired(false)),

    name: 'myfarm',
    aliases: ['مزرعتي', 'حيواناتي','mf'],
    category: "Economy",
    description: 'يعرض مزرعتك وحالة الحيوانات ومخزن الأعلاف والأراضي.',
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

        const now = Date.now();
        const deadAnimals = [];
        
        const allUserAnimals = sql.prepare("SELECT * FROM user_farm WHERE userID = ? AND guildID = ?").all(userId, guildId);
        
        const stmtLogDeath = sql.prepare("INSERT INTO farm_daily_log (userID, guildID, actionType, itemName, count, timestamp) VALUES (?, ?, ?, ?, ?, ?)");

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
                const animalName = animalDef ? animalDef.name : 'حيوان مجهول';
                const qty = row.quantity || 1;

                deadAnimals.push(`${qty}x ${animalName}`);
                
                sql.prepare("DELETE FROM user_farm WHERE id = ?").run(row.id);

                stmtLogDeath.run(userId, guildId, 'death_starve', animalName, qty, now);
            }
        }

        if (deadAnimals.length > 0 && isOwner) {
            const deathEmbed = new EmbedBuilder()
                .setTitle('☠️ لقد نفقت بعض حيواناتك من الجوع!')
                .setDescription(`بسبب الإهمال وطول فترة الجوع، خسرت:\n\n❌ **${deadAnimals.join('\n❌ ')}**`)
                .setColor(Colors.Red);
            
            const msgPayload = { embeds: [deathEmbed], flags: [MessageFlags.Ephemeral] };
            if (isSlash) await interaction.followUp(msgPayload);
            else message.reply(msgPayload);
        }

        const renderFarmAnimals = (page = 0) => {
            const maxCapacity = getPlayerCapacity(client, userId, guildId);
            const userAnimals = sql.prepare("SELECT * FROM user_farm WHERE userID = ? AND guildID = ? ORDER BY quantity DESC").all(userId, guildId);

            const baseEmbed = new EmbedBuilder()
                .setColor("Random")
                .setAuthor({ name: `🐄 حظيرة ${targetUser.username}`, iconURL: targetUser.displayAvatarURL() })
                .setImage('https://i.postimg.cc/65VKKCdP/dp2kuk914o9y_gif_1731_560.gif');

            if (!userAnimals || userAnimals.length === 0) {
                baseEmbed.setDescription(`📦 **السعة:** [ \`0\` / \`${maxCapacity}\` ]\n\n🍂 **الحظيرة فارغة**\nيمكنك شراء حيوانات من المتجر.`);
                return { embed: baseEmbed, rows: getAnimalsButtons(0, 0), files: [] };
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

                const purchaseTime = row.purchaseTimestamp || now;
                const ageMS = now - purchaseTime;
                const ageDays = Math.floor(ageMS / DAY_MS);
                const lifeRemaining = Math.max(0, animalData.lifespan_days - ageDays);

                const lastFed = row.lastFedTimestamp || now;
                const hungerTimeMs = now - lastFed;
                const hungerDays = Math.floor(hungerTimeMs / DAY_MS);
                const maxHunger = animalData.max_hunger_days || 7;
                const daysUntilDeath = Math.max(0, maxHunger - hungerDays);

                let hungerStatusText = "";
                const cooldownMs = 12 * HOUR_MS; 

                // 🔥 التعديل المطلوب: حساب الساعات إذا كان أقل من 12 ساعة، والأيام إذا تجاوزها 🔥
                if (hungerTimeMs < cooldownMs) {
                    const remainingHours = Math.ceil((cooldownMs - hungerTimeMs) / HOUR_MS);
                    hungerStatusText = `🟢 شبعان - متبقي ${remainingHours} ساعات للإطعام 🥄`;
                } else {
                    if (daysUntilDeath <= 1) hungerStatusText = `🔴 على وشك الموت - يوم واحد متبقي!`;
                    else hungerStatusText = `🟡 بدأ يجوع - ${daysUntilDeath} أيام متبقية`;
                }

                if (animalsMap.has(animalData.id)) {
                    const existing = animalsMap.get(animalData.id);
                    existing.quantity += qty;
                    existing.income += (animalData.income_per_day * qty);
                    if (daysUntilDeath < existing.minDays) { existing.minDays = daysUntilDeath; existing.hungerText = hungerStatusText; }
                    if (ageDays > existing.age) { existing.age = ageDays; existing.lifeRemaining = lifeRemaining; }
                } else {
                    animalsMap.set(animalData.id, {
                        ...animalData, quantity: qty, income: animalData.income_per_day * qty,
                        minDays: daysUntilDeath, hungerText: hungerStatusText, age: ageDays, lifeRemaining: lifeRemaining
                    });
                }
            }

            const processedAnimals = Array.from(animalsMap.values());
            const totalPages = Math.ceil(processedAnimals.length / ITEMS_PER_PAGE);
            
            if (page < 0) page = 0;
            if (page >= totalPages && totalPages > 0) page = totalPages - 1;

            const start = page * ITEMS_PER_PAGE;
            const end = start + ITEMS_PER_PAGE;
            const currentItems = processedAnimals.slice(start, end);

            let header = currentCapacityUsed >= maxCapacity 
                ? `🚫 **الحظيرة ممتلئة!**\n✶ السعة: [ \`${currentCapacityUsed}\` / \`${maxCapacity}\` ]\n💡 ارفع مستواك لزيادة السعة القصوى.\n\n`
                : `📦 **إحصائيات السعة:**\n✶ المساحة المستخدمة: [ \`${currentCapacityUsed}\` / \`${maxCapacity}\` ]\n\n`;

            const desc = currentItems.map(item => 
                `**✥ ${item.name} ${item.emoji}**\n` +
                `✶ الـعـدد: \`${item.quantity.toLocaleString()}\`\n` +
                `✶ الـدخـل اليومي: \`${item.income.toLocaleString()}\` ${EMOJI_MORA}\n` +
                `✥ حالـة الجـوع: ${item.hungerText}\n` +
                `✥ اقـدم حـيـوان عمـره: \`${item.age}\` يوم - متبقي \`${item.lifeRemaining}\` يوم`
            ).join('\n\n');

            baseEmbed.setDescription(header + (desc || "لا يوجد حيوانات في هذه الصفحة."));
            baseEmbed.setFooter({ text: `صفحة ${page + 1}/${totalPages} • الدخل اليومي: ${totalFarmIncome.toLocaleString()}`, iconURL: targetUser.displayAvatarURL() });

            return { embed: baseEmbed, rows: getAnimalsButtons(page, totalPages), files: [] };
        };

        const renderFeedStore = () => {
            const inventory = sql.prepare("SELECT * FROM user_inventory WHERE userID = ? AND guildID = ?").all(userId, guildId);
            const feedInventory = [];

            feedItems.forEach(feed => {
                const itemInInv = inventory.find(i => i.itemID === feed.id);
                if (itemInInv && itemInInv.quantity > 0) {
                    const targetAnimal = farmAnimals.find(a => a.feed_id === feed.id);
                    feedInventory.push({ 
                        ...feed, qty: itemInInv.quantity,
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
                embed.setDescription("🚫 **المخزن فارغ!**\nقم بشراء الأعلاف من المتجر لإطعام حيواناتك.");
            } else {
                const list = feedInventory.map(f => 
                    `✶ ${f.emoji} **${f.name}** : \`${f.qty}\` ⬅️ لـ **${f.animalName}** ${f.animalEmoji}`
                ).join('\n\n');
                embed.setDescription(list);
            }
            return { embed, rows: getFeedStoreButtons(), files: [] };
        };

        const getAnimalsButtons = (page, totalPages) => {
            const row = new ActionRowBuilder();
            if (totalPages > 1) {
                row.addComponents(
                    new ButtonBuilder().setCustomId('farm_prev').setEmoji(LEFT_EMOJI).setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
                    new ButtonBuilder().setCustomId('farm_next').setEmoji(RIGHT_EMOJI).setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1)
                );
            }
            row.addComponents(
                new ButtonBuilder().setCustomId('btn_back_home').setLabel('العودة للمزرعة').setStyle(ButtonStyle.Secondary).setEmoji('🏠')
            );
            return row.components.length > 0 ? [row] : [];
        };

        const getFeedStoreButtons = () => {
            return [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_feed_animal').setLabel('اطعـام').setStyle(ButtonStyle.Success).setEmoji('🥄'),
                new ButtonBuilder().setCustomId('btn_back_home').setLabel('رجـوع للمزرعة').setStyle(ButtonStyle.Secondary).setEmoji('🏠')
            )];
        };

        let currentPage = 0;
        let currentView = 'land'; 

        const mockInteraction = { 
            user: targetUser, 
            guild: guild, 
            member: targetMember,
            id: message ? message.id : interaction.id 
        };

        const landData = await renderLand(mockInteraction, client, sql);

        const navigationRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('open_animals_view').setLabel('الحيوانات').setStyle(ButtonStyle.Secondary).setEmoji('🐮'),
            new ButtonBuilder().setCustomId('open_feed_store').setLabel('المخزن').setStyle(ButtonStyle.Secondary).setEmoji('🌾')
        );
        const initialComponents = [...(landData.components || []), navigationRow];

        const msg = await reply({ 
            embeds: landData.embeds || [], 
            components: initialComponents,
            files: landData.files, 
            content: landData.content || '',
            fetchReply: true 
        });

        const collector = msg.createMessageComponentCollector({ 
            filter: i => {
                if (i.user.id === user.id) return true;
                i.reply({ content: `🚫 هذا الأمر خاص بـ ${user}`, flags: [MessageFlags.Ephemeral] });
                return false;
            }, 
            time: 300000 
        });

        collector.on('collect', async i => {
            try {
                if (i.customId === 'btn_back_home') {
                    await i.deferUpdate();
                    currentView = 'land';
                    const landData = await renderLand(mockInteraction, client, sql);
                    
                    const navRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('open_animals_view').setLabel('الحيوانات').setStyle(ButtonStyle.Secondary).setEmoji('🐮'),
                        new ButtonBuilder().setCustomId('open_feed_store').setLabel('المخزن').setStyle(ButtonStyle.Secondary).setEmoji('🌾')
                    );

                    await i.editReply({ 
                        embeds: [], 
                        content: landData.content || '',
                        components: [...(landData.components || []), navRow], 
                        files: landData.files,
                        attachments: [] 
                    });
                }
                else if (i.customId === 'open_animals_view') {
                    await i.deferUpdate();
                    currentView = 'animals';
                    currentPage = 0;
                    const data = renderFarmAnimals(0);
                    await i.editReply({ embeds: [data.embed], components: data.rows, files: [], attachments: [], content: '' });
                }
                else if (i.customId === 'farm_prev') {
                    await i.deferUpdate();
                    currentPage--;
                    const data = renderFarmAnimals(currentPage);
                    await i.editReply({ embeds: [data.embed], components: data.rows });
                } 
                else if (i.customId === 'farm_next') {
                    await i.deferUpdate();
                    currentPage++;
                    const data = renderFarmAnimals(currentPage);
                    await i.editReply({ embeds: [data.embed], components: data.rows });
                }
                else if (i.customId === 'open_feed_store') {
                    await i.deferUpdate();
                    currentView = 'feed_store';
                    const data = renderFeedStore();
                    await i.editReply({ embeds: [data.embed], components: data.rows, files: [], attachments: [], content: '' });
                }
                else if (i.customId === 'btn_feed_animal') {
                    if (!isOwner) return await i.reply({ content: '🚫 لا يمكنك إطعام حيوانات ليست ملكك!', flags: [MessageFlags.Ephemeral] });

                    const userAnimalsRows = sql.prepare("SELECT animalID FROM user_farm WHERE userID = ? AND guildID = ?").all(userId, guildId);
                    const distinctAnimalIds = [...new Set(userAnimalsRows.map(r => r.animalID))];
                    
                    const options = [];
                    for (const animId of distinctAnimalIds) {
                        const animal = farmAnimals.find(a => String(a.id) === String(animId));
                        if (!animal) continue; 
                        options.push({ label: `إطعام ${animal.name}`, description: `يتطلب ${feedItems.find(f=>f.id===animal.feed_id)?.name}`, value: animal.id, emoji: animal.emoji });
                    }

                    if (options.length === 0) return await i.reply({ content: '❌ لا تملك حيوانات.', flags: [MessageFlags.Ephemeral] });

                    const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_feed_animal').setPlaceholder('اختر الحيوان...').addOptions(options));
                    const response = await i.reply({ content: '🥄 **الإطعام:**', components: [row], flags: [MessageFlags.Ephemeral], fetchReply: true });
                    
                    const subCollector = response.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000, max: 1 });
                    
                    subCollector.on('collect', async subI => {
                        if (subI.customId === 'menu_feed_animal') {
                            const animalId = subI.values[0];
                            const animal = farmAnimals.find(a => String(a.id) === String(animalId));
                            const feedId = animal.feed_id;
                            
                            const sample = sql.prepare("SELECT lastFedTimestamp FROM user_farm WHERE userID = ? AND guildID = ? AND animalID = ? LIMIT 1").get(userId, guildId, animalId);
                            if (sample && sample.lastFedTimestamp && (Date.now() - sample.lastFedTimestamp) < 12*3600*1000) {
                                return subI.reply({ content: `✋ **${animal.name}** شبعان!\nيمكنك إطعامه مرة كل 12 ساعة.`, flags: [MessageFlags.Ephemeral] });
                            }

                            const countRow = sql.prepare("SELECT SUM(quantity) as total FROM user_farm WHERE userID = ? AND guildID = ? AND animalID = ?").get(userId, guildId, animalId);
                            const totalAnimals = countRow ? countRow.total : 0;
                            const invRow = sql.prepare("SELECT quantity FROM user_inventory WHERE userID = ? AND guildID = ? AND itemID = ?").get(userId, guildId, feedId);
                            
                            if (!invRow || invRow.quantity < totalAnimals) {
                                return subI.reply({ content: `❌ **علف غير كافي!**\nتحتاج **${totalAnimals}** وحدة لإطعام القطيع بالكامل.`, flags: [MessageFlags.Ephemeral] });
                            }
                            
                            sql.prepare("UPDATE user_inventory SET quantity = quantity - ? WHERE userID = ? AND guildID = ? AND itemID = ?").run(totalAnimals, userId, guildId, feedId);
                            sql.prepare("UPDATE user_farm SET lastFedTimestamp = ? WHERE userID = ? AND guildID = ? AND animalID = ?").run(Date.now(), userId, guildId, animalId);
                            
                            await subI.reply({ content: `✅ تم إطعام ${totalAnimals} **${animal.name}** بنجاح!`, flags: [MessageFlags.Ephemeral] });
                            
                            if (currentView === 'feed_store') {
                                const data = renderFeedStore();
                                await msg.edit({ embeds: [data.embed], components: data.rows, files: [], attachments: [] });
                            }
                        }
                    });
                }

            } catch (err) { console.error("Error in myfarm collector:", err); }
        });

        collector.on('end', () => { if (msg.editable) msg.edit({ components: [] }).catch(() => {}); });
    }
};
