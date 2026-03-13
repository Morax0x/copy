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
            await interaction.deferReply().catch(() => {});
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            user = message.author;
            targetMember = message.mentions.members.first() || message.member;
        }

        const reply = async (payload) => {
            if (isSlash) return interaction.editReply(payload).catch(() => {});
            return message.channel.send(payload).catch(() => {});
        };

        const db = client.sql;
        const targetUser = targetMember.user;
        const userId = targetUser.id; 
        const guildId = guild.id;
        
        const isOwner = user.id === userId; 
        const now = Date.now();

        // 🔥 تم مسح كود الموت من الجوع هنا (بناءً على التحديث الجديد) 🔥

        const renderFarmAnimals = async (page = 0) => {
            const maxCapacity = await getPlayerCapacity(client, userId, guildId);
            const userAnimalsRes = await db.query(`SELECT * FROM user_farm WHERE "userID" = $1 AND "guildID" = $2 ORDER BY "quantity" DESC`, [userId, guildId]);
            const userAnimals = userAnimalsRes.rows;

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
                const animalData = farmAnimals.find(a => String(a.id) === String(row.animalID || row.animalid));
                if (!animalData) continue; 
                
                const qty = Number(row.quantity) || 1;
                currentCapacityUsed += (qty * (animalData.size || 1));

                const purchaseTime = Number(row.purchaseTimestamp || row.purchasetimestamp) || now;
                const ageMS = now - purchaseTime;
                const ageDays = Math.floor(ageMS / DAY_MS);
                const lifeRemaining = Math.max(0, animalData.lifespan_days - ageDays);

                // ----------------------------------------------------
                // 🟢 نظام العداد الزمني للشبع الجديد
                // ----------------------------------------------------
                const lastFed = Number(row.lastFedTimestamp || row.lastfedtimestamp) || now;
                const maxHungerMs = (animalData.max_hunger_days || 3) * DAY_MS; 
                const fullUntil = lastFed + maxHungerMs; 
                const timeLeftMs = fullUntil - now;
                
                let hungerStatusText = "";
                
                // حساب الدخل (فقط إذا بقي له أكثر من 12 ساعة شبع)
                if (timeLeftMs >= (12 * 60 * 60 * 1000)) {
                    totalFarmIncome += (animalData.income_per_day * qty);
                }

                // تجهيز نص الشبع للديسكورد
                if (timeLeftMs > 0) {
                    const timestampSeconds = Math.floor(fullUntil / 1000);
                    hungerStatusText = `🟢 شبعـان: <t:${timestampSeconds}:R>`;
                } else {
                    hungerStatusText = `🔴 جـائـع - بـدون دخـل`;
                }

                if (animalsMap.has(animalData.id)) {
                    const existing = animalsMap.get(animalData.id);
                    existing.quantity += qty;
                    // تجميع الدخل فقط إذا كان الحيوان مدمجاً وحالته شبعان
                    if (timeLeftMs >= (12 * 60 * 60 * 1000)) existing.income += (animalData.income_per_day * qty);
                    if (ageDays > existing.age) { existing.age = ageDays; existing.lifeRemaining = lifeRemaining; }
                } else {
                    animalsMap.set(animalData.id, {
                        ...animalData, quantity: qty, 
                        income: (timeLeftMs >= (12 * 60 * 60 * 1000)) ? (animalData.income_per_day * qty) : 0,
                        hungerText: hungerStatusText, age: ageDays, lifeRemaining: lifeRemaining
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
                `✶ الـدخـل اليومي: \`${item.income.toLocaleString()}\` ${EMOJI_MORA} ${item.income === 0 ? ' متوقف بسبب الجوع' : ''}\n` +
                `✥ حالـة الجـوع: ${item.hungerText}\n` +
                `✥ اقـدم حـيـوان عمـره: \`${item.age}\` يوم - متبقي \`${item.lifeRemaining}\``
            ).join('\n\n');

            baseEmbed.setDescription(header + (desc || "لا يوجد حيوانات في هذه الصفحة."));
            baseEmbed.setFooter({ text: `صفحة ${page + 1}/${totalPages} • إجمالي الدخل اليومي: ${totalFarmIncome.toLocaleString()}`, iconURL: targetUser.displayAvatarURL() });

            return { embed: baseEmbed, rows: getAnimalsButtons(page, totalPages), files: [] };
        };

        const renderFeedStore = async () => {
            const inventoryRes = await db.query(`SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]);
            const inventory = inventoryRes.rows;
            const feedInventory = [];

            feedItems.forEach(feed => {
                const itemInInv = inventory.find(i => (i.itemID || i.itemid) === feed.id);
                if (itemInInv && Number(itemInInv.quantity) > 0) {
                    const targetAnimal = farmAnimals.find(a => a.feed_id === feed.id);
                    feedInventory.push({ 
                        ...feed, qty: Number(itemInInv.quantity),
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

        const landData = await renderLand(mockInteraction, client, db);

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
                i.reply({ content: `🚫 هذا الأمر خاص بـ ${user}`, flags: [MessageFlags.Ephemeral] }).catch(() => {});
                return false;
            }, 
            time: 300000 
        });

        collector.on('collect', async i => {
            try {
                if (i.customId === 'btn_back_home') {
                    await i.deferUpdate().catch(() => {});
                    currentView = 'land';
                    const landData = await renderLand(mockInteraction, client, db);
                    
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
                    }).catch(() => {});
                }
                else if (i.customId === 'open_animals_view') {
                    await i.deferUpdate().catch(() => {});
                    currentView = 'animals';
                    currentPage = 0;
                    const data = await renderFarmAnimals(0);
                    await i.editReply({ embeds: [data.embed], components: data.rows, files: [], attachments: [], content: '' }).catch(() => {});
                }
                else if (i.customId === 'farm_prev') {
                    await i.deferUpdate().catch(() => {});
                    currentPage--;
                    const data = await renderFarmAnimals(currentPage);
                    await i.editReply({ embeds: [data.embed], components: data.rows }).catch(() => {});
                } 
                else if (i.customId === 'farm_next') {
                    await i.deferUpdate().catch(() => {});
                    currentPage++;
                    const data = await renderFarmAnimals(currentPage);
                    await i.editReply({ embeds: [data.embed], components: data.rows }).catch(() => {});
                }
                else if (i.customId === 'open_feed_store') {
                    await i.deferUpdate().catch(() => {});
                    currentView = 'feed_store';
                    const data = await renderFeedStore();
                    await i.editReply({ embeds: [data.embed], components: data.rows, files: [], attachments: [], content: '' }).catch(() => {});
                }
                else if (i.customId === 'btn_feed_animal') {
                    if (!isOwner) return await i.reply({ content: '🚫 لا يمكنك إطعام حيوانات ليست ملكك!', flags: [MessageFlags.Ephemeral] }).catch(() => {});

                    const userAnimalsRowsRes = await db.query(`SELECT "animalID" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]);
                    const userAnimalsRows = userAnimalsRowsRes.rows;
                    const distinctAnimalIds = [...new Set(userAnimalsRows.map(r => r.animalID || r.animalid))];
                    
                    const options = [];
                    for (const animId of distinctAnimalIds) {
                        const animal = farmAnimals.find(a => String(a.id) === String(animId));
                        if (!animal) continue; 
                        options.push({ label: `إطعام ${animal.name}`, description: `يتطلب ${feedItems.find(f=>f.id===animal.feed_id)?.name}`, value: animal.id, emoji: animal.emoji });
                    }

                    if (options.length === 0) return await i.reply({ content: '❌ لا تملك حيوانات.', flags: [MessageFlags.Ephemeral] }).catch(() => {});

                    const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('menu_feed_animal').setPlaceholder('اختر الحيوان...').addOptions(options));
                    const response = await i.reply({ content: '🥄 **الإطعام:**', components: [row], flags: [MessageFlags.Ephemeral], fetchReply: true }).catch(() => {});
                    
                    if (!response) return; 

                    const subCollector = response.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000, max: 1 });
                    
                    subCollector.on('collect', async subI => {
                        if (subI.customId === 'menu_feed_animal') {
                            const animalId = subI.values[0];
                            const animal = farmAnimals.find(a => String(a.id) === String(animalId));
                            const feedId = animal.feed_id;
                            const maxHungerMs = (animal.max_hunger_days || 3) * DAY_MS;
                            
                            const sampleRes = await db.query(`SELECT "lastFedTimestamp" FROM user_farm WHERE "userID" = $1 AND "guildID" = $2 AND "animalID" = $3 LIMIT 1`, [userId, guildId, animalId]);
                            const sample = sampleRes.rows[0];
                            
                            // 🔥 حماية الإطعام المبكر: لا يمكن إطعامه إلا إذا نقص الشبع عن النصف
                            if (sample && (sample.lastFedTimestamp || sample.lastfedtimestamp)) {
                                const lastFed = Number(sample.lastFedTimestamp || sample.lastfedtimestamp);
                                const timeSinceFed = Date.now() - lastFed;
                                if (timeSinceFed < (maxHungerMs * 0.5)) {
                                    return subI.reply({ content: `✋ **${animal.name}** ما زال شبعاناً!\nيرجى الانتظار حتى يجوع قليلاً لعدم تبذير الأعلاف.`, flags: [MessageFlags.Ephemeral] }).catch(() => {});
                                }
                            }

                            const countRowRes = await db.query(`SELECT SUM("quantity") as total FROM user_farm WHERE "userID" = $1 AND "guildID" = $2 AND "animalID" = $3`, [userId, guildId, animalId]);
                            const countRow = countRowRes.rows[0];
                            const totalAnimals = countRow ? Number(countRow.total) : 0;
                            
                            const invRowRes = await db.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [userId, guildId, feedId]);
                            const invRow = invRowRes.rows[0];
                            
                            if (!invRow || Number(invRow.quantity) < totalAnimals) {
                                return subI.reply({ content: `❌ **علف غير كافي!**\nتحتاج **${totalAnimals}** وحدة لإطعام القطيع بالكامل.`, flags: [MessageFlags.Ephemeral] }).catch(() => {});
                            }
                            
                            await db.query(`UPDATE user_inventory SET "quantity" = "quantity" - $1 WHERE "userID" = $2 AND "guildID" = $3 AND "itemID" = $4`, [totalAnimals, userId, guildId, feedId]);
                            await db.query(`UPDATE user_farm SET "lastFedTimestamp" = $1 WHERE "userID" = $2 AND "guildID" = $3 AND "animalID" = $4`, [Date.now(), userId, guildId, animalId]);
                            
                            await subI.reply({ content: `✅ تم إطعام ${totalAnimals} **${animal.name}** بنجاح وتجديد طاقته!`, flags: [MessageFlags.Ephemeral] }).catch(() => {});
                            
                            if (currentView === 'feed_store') {
                                const data = await renderFeedStore();
                                await msg.edit({ embeds: [data.embed], components: data.rows, files: [], attachments: [] }).catch(() => {});
                            }
                        }
                    });
                }

            } catch (err) { console.error("Error in myfarm collector:", err); }
        });

        collector.on('end', () => { if (msg.editable) msg.edit({ components: [] }).catch(() => {}); });
    }
};
