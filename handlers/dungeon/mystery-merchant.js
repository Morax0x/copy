const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, ButtonStyle, ComponentType, Colors } = require('discord.js');
const { EMOJI_MORA, EMOJI_BUFF, EMOJI_NERF } = require('./constants');

const QUOTES = [
    "«المورا تشتري السلاح… وما أملكه يشتري نجاتك.»",
    "«قد تمشي حيًّا بلا صفقة… لكنك لن تعود.»",
    "«ما أقدّمه ليس رحمة… بل فرصة أخيرة.»",
    "«الدانجون لا يرحم… وأنا لا أبيع إلا لمن يجرؤ.»",
    "«سلاحٌ واحد مني… قد يختصر عمرك أو يطيله.»",
    "«الكنوز تُغريك… أما بضاعتي فتنقذك.»",
    "«من دوني أنت شجاع… ومعي أنت حي.»",
    "«الظلام يساومك بالموت… وأنا أساومك بالمورا.»",
    "«ليس كل من اشترى نجا… لكن كل ناجٍ اشترى.»",
    "«إن كنت تبحث عن الأمل… فهو ليس مجانيًا.»"
];

const SHOP_ITEMS = [
    {
        id: 'buy_elixir',
        name: 'إكسيـر الحيـاة',
        price: 3000,
        desc: 'يعيد إحياءك بـ 50% HP (أو يعالجك بالكامل).',
        emoji: '🩸'
    },
    {
        id: 'buy_blood',
        name: 'عقـد الـدم',
        price: 1500,
        desc: 'خصم 30% من صحتك القصوى مقابل +40% هجوم دائم.',
        emoji: '📜'
    },
    {
        id: 'buy_map',
        name: 'خريطـة مختصـرة',
        price: 3000,
        desc: 'تخطي طابقين فوراً مع الحصول على نصف جوائزهم.',
        emoji: '🗺️'
    },
    {
        id: 'buy_shield',
        name: 'درع المرتزقـة',
        price: 1000,
        desc: 'تبدأ الطابق القادم بدرع يمتص 5000 ضرر.',
        emoji: '🛡️'
    },
    {
        id: 'buy_eye',
        name: 'عين البصيـرة',
        price: 1000,
        desc: 'كشف نقطة ضعف وحش الطابق القادم (ضرر +25%).',
        emoji: '👁️'
    }
];

async function triggerMysteryMerchant(thread, players, sql, guildId, merchantState) {
    const randomQuote = QUOTES[Math.floor(Math.random() * QUOTES.length)];

    const embed = new EmbedBuilder()
        .setTitle('★ التـاجـر المتجـول ظهـر !')
        // 🔥 تم تعديل الوقت هنا إلى 45 ثانية 🔥
        .setDescription(`> **"${randomQuote}"**\n\nيَعرض بضائع نادرة هل تجرؤ على الشراء؟\n\n⏳ **يغادر بعد 45 ثانية...**`)
        .setImage('https://i.postimg.cc/DypZtNmr/00000.png')
        .setColor(Colors.Grey);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('merchant_view')
            .setLabel('القـاء نظـرة')
            .setEmoji('🛒')
            .setStyle(ButtonStyle.Secondary)
    );

    const msg = await thread.send({ embeds: [embed], components: [row] });

    // 🔥 تم تعديل وقت الكوليكتر إلى 45000 (45 ثانية) 🔥
    const buttonCollector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 45000 });

    buttonCollector.on('collect', async (i) => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});

        const player = players.find(p => p.id === i.user.id);
        if (!player) return i.followUp({ content: '🚫 أنت لست في الفريق.', ephemeral: true });

        // جلب الرصيد الحالي للعرض
        const userBalance = sql.prepare("SELECT mora FROM levels WHERE user = ? AND guild = ?").get(i.user.id, guildId);
        const currentMora = userBalance ? userBalance.mora : 0;

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('merchant_select')
            .setPlaceholder('اختر سلعة للشراء...')
            .addOptions(
                SHOP_ITEMS.map(item => ({
                    label: item.name,
                    description: `${item.desc} | السعر: ${item.price}`,
                    value: item.id,
                    emoji: item.emoji
                }))
            );

        const selectRow = new ActionRowBuilder().addComponents(selectMenu);

        const reply = await i.followUp({ 
            content: `💰 **رصيدك الحالي:** ${currentMora.toLocaleString()} ${EMOJI_MORA}\nاختر ما تريد شراءه بعناية:`, 
            components: [selectRow], 
            ephemeral: true,
            fetchReply: true 
        });

        const selectCollector = reply.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 30000 }); // جعلنا وقت الاختيار أقصر قليلاً ليتناسب مع السرعة

        selectCollector.on('collect', async (si) => {
            const selectedId = si.values[0];
            const item = SHOP_ITEMS.find(it => it.id === selectedId);

            // التحقق من الرصيد مرة أخرى عند الضغط
            const freshBalance = sql.prepare("SELECT mora FROM levels WHERE user = ? AND guild = ?").get(si.user.id, guildId);
            const actualMora = freshBalance ? freshBalance.mora : 0;

            if (actualMora < item.price) {
                return si.reply({ content: `❌ **لا تملك مورا كافية!** تحتاج ${item.price} مورا.`, ephemeral: true });
            }

            // خصم المبلغ
            sql.prepare("UPDATE levels SET mora = mora - ? WHERE user = ? AND guild = ?").run(item.price, si.user.id, guildId);

            // تطبيق التأثيرات
            let effectMsg = "";

            if (selectedId === 'buy_elixir') {
                if (!player.isDead) {
                    player.hp = player.maxHp;
                    effectMsg = "شرب إكسير الحياة وشعر بقوة الخلود (HP كامل)!";
                } else {
                    player.isDead = false;
                    player.isPermDead = false;
                    player.hp = Math.floor(player.maxHp * 0.5);
                    player.reviveCount = 0;
                    effectMsg = "عاد من الموت بفضل إكسير الحياة!";
                }
            } 
            else if (selectedId === 'buy_blood') {
                player.maxHp = Math.floor(player.maxHp * 0.7); 
                if (player.hp > player.maxHp) player.hp = player.maxHp;
                player.effects.push({ type: 'atk_buff', val: 0.4, turns: 999 }); 
                effectMsg = "وقّع عقد الدم! (HP انخفض، وهجومه زاد 40% لنهاية الرحلة)";
            }
            else if (selectedId === 'buy_shield') {
                player.startingShield = 5000;
                effectMsg = "تجهز بدرع المرتزقة الصلب! (سيبدأ الطابق القادم بـ 5000 درع)";
            }
            else if (selectedId === 'buy_map') {
                merchantState.skipFloors += 2;
                effectMsg = "اشترى خريطة سرية! سيتم تخطي الطابقين القادمين.";
            }
            else if (selectedId === 'buy_eye') {
                merchantState.weaknessActive = true;
                effectMsg = "حصل على عين البصيرة! وحش الطابق القادم سيكون مكشوفاً.";
            }

            await si.update({ content: `✅ **تم الشراء بنجاح!** خصم ${item.price} مورا.\nالمتبقي: ${(actualMora - item.price).toLocaleString()}`, components: [] });
            
            await thread.send(`🤝 **أبـرم ${player.name} صفـقـة مع التاجر واشتـرى ${item.name} مقابل ${item.price} ${EMOJI_MORA}**\n*${effectMsg}*`);
        });
    });

    buttonCollector.on('end', async () => {
        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('merchant_view')
                .setLabel('القـاء نظـرة')
                .setEmoji('🛒')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        );
        await msg.edit({ components: [disabledRow] }).catch(() => {});
        await thread.send("🌑 **اختفى التاجر في الظلال كما ظهر...**");
    });
}

module.exports = { triggerMysteryMerchant };
