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
            .setDescription('المستخدم الذي تريد عرض مزرعته')
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
            // ✅ (Stacking Update): جلب البيانات مباشرة بدون تجميع ثقيل
            // البيانات مجمعة أصلاً في الجدول بفضل العمود quantity
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
            baseEmbed.setDescription(`✶ وصـلت سعـة مزرعتـك لـ اعلـى مستوى: [ \`0\` / \`${maxCapacity}\` ]\n\nمـزرعـة فـارغـة`);
            baseEmbed.setImage('https://i.postimg.cc/65VKKCdP/dp2kuk914o9y-gif-1731-560.gif');
            return reply({ embeds: [baseEmbed] });
        }

        // 1. حساب الإجماليات
        let totalFarmIncome = 0;
        let currentCapacityUsed = 0; 
        const now = Date.now();

        const processedAnimals = [];

        for (const row of userAnimals) {
            const animalData = farmAnimals.find(a => a.id === row.animalID);
            if (!animalData) continue;

            // ✅ (Stacking Update): استخدام الكمية من قاعدة البيانات
            const quantity = row.quantity || 1;

            // حساب الحجم الكلي لهذا النوع
            const animalSize = animalData.size || 1;
            currentCapacityUsed += (quantity * animalSize);

            // حساب الدخل الكلي لهذا النوع
            const incomePerAnimal = animalData.income_per_day || 0;
            const totalIncome = incomePerAnimal * quantity;
            totalFarmIncome += totalIncome;

            // حساب العمر
            const lifespanDays = animalData.lifespan_days || 30;
            const purchaseTime = row.purchaseTimestamp || now;
            const ageMS = now - purchaseTime;
            const ageDays = Math.floor(ageMS / (1000 * 60 * 60 * 24));
            const daysRemaining = Math.max(0, lifespanDays - ageDays);

            processedAnimals.push({
                name: animalData.name,
                emoji: animalData.emoji,
                quantity: quantity,
                income: totalIncome,
                age: ageDays,
                remaining: daysRemaining
            });
        }

        // بناء الهيدر الثابت
        let headerText = "";
        
        if (currentCapacityUsed >= maxCapacity) {
            headerText = `✶ وصـلت مزرعتـك لحدهـا الاقصـى ارفع لفلك لزيادة السعة: [ \`${currentCapacityUsed}\` / \`${maxCapacity}\` ]\n\n`;
        } else {
            headerText = `✶ وصـلت سعـة مزرعتـك لـ اعلـى مستوى: [ \`${currentCapacityUsed}\` / \`${maxCapacity}\` ]\n\n`;
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
