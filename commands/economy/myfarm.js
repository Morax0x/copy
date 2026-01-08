const { 
    EmbedBuilder, 
    Colors, 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ComponentType 
} = require("discord.js");
const farmAnimals = require('../../json/farm-animals.json');
// ✅ استدعاء دالة السعة الموحدة
const { getPlayerCapacity } = require('../../utils/farmUtils.js');

const EMOJI_MORA = '<:mora:1435647151349698621>';
const LEFT_EMOJI = '<:left:1439164494759723029>';
const RIGHT_EMOJI = '<:right:1439164491072929915>';
const ITEMS_PER_PAGE = 3;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('مزرعتي')
        .setDescription('يعرض جميع الحيوانات التي تملكها في مزرعتك أو مزرعة عضو آخر.')
        .addUserOption(option => 
            option.setName('المستخدم')
            .setDescription('المستخدم الذي تريد عرض مزرعتـه')
            .setRequired(false)),

    name: 'myfarm',
    aliases: ['مزرعتي', 'حيواناتي'],
    category: "Economy",
    description: 'يعرض جميع الحيوانات التي تملكها في مزرعتك أو مزرعة عضو آخر.',
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
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.channel.send(payload);
            }
        };

        const replyError = async (content) => {
            const payload = { content, ephemeral: true };
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.reply(payload);
            }
        };

        const sql = client.sql;
        const targetUser = targetMember.user;
        const userId = targetUser.id;
        const guildId = guild.id;

        // ============================================================
        // 🔒 حساب سعة المزرعة (الحد الأقصى)
        // ============================================================
        const maxCapacity = getPlayerCapacity(client, userId, guildId);

        let userAnimals;
        try {
            // جلب البيانات من قاعدة البيانات
            userAnimals = sql.prepare(`
                SELECT * FROM user_farm 
                WHERE userID = ? AND guildID = ? 
                ORDER BY quantity DESC
            `).all(userId, guildId);

        } catch (error) {
            console.error("خطأ في جلب حيوانات المزرعة:", error);
            return replyError("❌ حدث خطأ أثناء جلب بيانات المزرعة.");
        }

        const baseEmbed = new EmbedBuilder()
            .setColor("Random")
            .setAuthor({ name: `🏞️ مزرعـــة ${targetUser.username}`, iconURL: targetUser.displayAvatarURL() });

        if (!userAnimals || userAnimals.length === 0) {
            // ✅ تم التصحيح: نص منطقي للمزرعة الفارغة
            baseEmbed.setDescription(`📦 **السعة:** [ \`0\` / \`${maxCapacity}\` ]\n\n🍂 **مـزرعـة فـارغـة**\nقم بشراء حيوانات لملء مزرعتك.`);
            baseEmbed.setImage('https://i.postimg.cc/65VKKCdP/dp2kuk914o9y-gif-1731-560.gif');
            return reply({ embeds: [baseEmbed] });
        }

        // 1. حساب الإجماليات وتجميع الحيوانات
        let totalFarmIncome = 0;
        let currentCapacityUsed = 0; 
        const now = Date.now();

        // استخدام Map لتجميع الحيوانات المتشابهة
        const animalsMap = new Map();

        for (const row of userAnimals) {
            const animalData = farmAnimals.find(a => a.id === row.animalID);
            if (!animalData) continue;

            const quantity = row.quantity || 1;
            
            // حساب السعة والدخل الإجمالي
            currentCapacityUsed += (quantity * (animalData.size || 1));
            totalFarmIncome += (animalData.income_per_day * quantity);

            // حساب العمر
            const purchaseTime = row.purchaseTimestamp || now;
            const ageMS = now - purchaseTime;
            const ageDays = Math.floor(ageMS / (1000 * 60 * 60 * 24));
            const daysRemaining = Math.max(0, animalData.lifespan_days - ageDays);

            // التجميع في Map
            if (animalsMap.has(animalData.id)) {
                const existing = animalsMap.get(animalData.id);
                existing.quantity += quantity;
                existing.income += (animalData.income_per_day * quantity);
                if (ageDays > existing.age) {
                    existing.age = ageDays;
                    existing.remaining = daysRemaining;
                }
            } else {
                animalsMap.set(animalData.id, {
                    name: animalData.name,
                    emoji: animalData.emoji,
                    quantity: quantity,
                    income: animalData.income_per_day * quantity,
                    age: ageDays,
                    remaining: daysRemaining,
                    id: animalData.id
                });
            }
        }

        const processedAnimals = Array.from(animalsMap.values());

        // ✅✅ بناء الهيدر الثابت (تم التصحيح هنا) ✅✅
        let headerText = "";
        
        if (currentCapacityUsed >= maxCapacity) {
            // حالة الامتلاء
            headerText = `🚫 **المزرعة ممتلئة!**\n✶ السعة: [ \`${currentCapacityUsed}\` / \`${maxCapacity}\` ]\n💡 ارفع مستواك لزيادة السعة القصوى.\n\n`;
        } else {
            // حالة وجود مساحة (الوضع الطبيعي)
            headerText = `📦 **إحصائيات السعة:**\n✶ المساحة المستخدمة: [ \`${currentCapacityUsed}\` / \`${maxCapacity}\` ]\n\n`;
        }

        // دالة توليد الإيمبد
        const generateEmbed = (page) => {
            const embed = new EmbedBuilder(baseEmbed.data);
            
            const startIndex = page * ITEMS_PER_PAGE;
            const endIndex = startIndex + ITEMS_PER_PAGE;
            const currentItems = processedAnimals.slice(startIndex, endIndex);

            const descriptionLines = currentItems.map(item => 
                `**✥ ${item.name} ${item.emoji}**\n` +
                `✶ الـعـدد: \`${item.quantity.toLocaleString()}\`\n` +
                `✶ الـدخـل اليومي: \`${item.income.toLocaleString()}\` ${EMOJI_MORA}\n` +
                `✥ اقـدم حـيـوان عمـره: \`${item.age}\` يوم (متبقي \`${item.remaining}\` يوم)`
            );

            embed.setDescription(headerText + descriptionLines.join('\n\n'));
            
            embed.setFooter({
                text: `صفحة ${page + 1}/${Math.ceil(processedAnimals.length / ITEMS_PER_PAGE)} • إجمالي الدخل: ${totalFarmIncome.toLocaleString()} بـاليـوم`,
                iconURL: targetUser.displayAvatarURL({ dynamic: true })
            });
            
            embed.setImage('https://i.postimg.cc/65VKKCdP/dp2kuk914o9y-gif-1731-560.gif');
            
            return embed;
        };

        const generateButtons = (page) => {
            const totalPages = Math.ceil(processedAnimals.length / ITEMS_PER_PAGE);
            if (totalPages <= 1) return [];

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('farm_prev')
                        .setEmoji(LEFT_EMOJI)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('farm_next')
                        .setEmoji(RIGHT_EMOJI)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === totalPages - 1)
                );
            return [row];
        };

        let currentPage = 0;
        const msg = await reply({ 
            embeds: [generateEmbed(currentPage)], 
            components: generateButtons(currentPage),
            fetchReply: true 
        });

        if (processedAnimals.length <= ITEMS_PER_PAGE) return;

        const collector = msg.createMessageComponentCollector({ 
            componentType: ComponentType.Button, 
            time: 120000,
            filter: i => i.user.id === user.id 
        });

        collector.on('collect', async i => {
            if (i.customId === 'farm_prev') {
                currentPage--;
            } else if (i.customId === 'farm_next') {
                currentPage++;
            }
            await i.update({ 
                embeds: [generateEmbed(currentPage)], 
                components: generateButtons(currentPage) 
            });
        });

        collector.on('end', () => {
            if (msg.editable) {
                const disabledRow = generateButtons(currentPage)[0];
                if (disabledRow) {
                    disabledRow.components.forEach(btn => btn.setDisabled(true));
                    msg.edit({ components: [disabledRow] }).catch(() => {});
                }
            }
        });
    }
};
