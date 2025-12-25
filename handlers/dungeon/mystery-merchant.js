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

// قائمة البضائع وأسعارها وتأثيراتها
const SHOP_ITEMS = [
    {
        id: 'buy_elixir',
        name: 'إكسيـر الحيـاة',
        price: 5000,
        desc: 'يعيد إحياءك بـ 50% HP (يعمل حتى للموت النهائي).',
        emoji: '🩸'
    },
    {
        id: 'buy_blood',
        name: 'عقـد الـدم',
        price: 3000,
        desc: 'خصم 30% من صحتك القصوى مقابل +40% هجوم.',
        emoji: '📜'
    },
    {
        id: 'buy_map',
        name: 'خريطـة مختصـرة',
        price: 4000,
        desc: 'تخطي طابقين فوراً مع الحصول على نصف جوائزهم.',
        emoji: '🗺️'
    },
    {
        id: 'buy_shield',
        name: 'درع المرتزقـة',
        price: 1500,
        desc: 'يمنحك درعاً مؤقتاً يمتص 5000 ضرر.',
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
    // اختيار جملة عشوائية
    const randomQuote = QUOTES[Math.floor(Math.random() * QUOTES.length)];

    const embed = new EmbedBuilder()
        .setTitle('★ التـاجـر المتجـول ظهـر !')
        .setDescription(`> **"${randomQuote}"**\n\nيَعرض بضائع نادرة هل تجرؤ على الشراء؟\n\n⏳ **يغادر بعد 75 ثانية...**`)
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

    // كوليكتر الزر (القاء نظرة)
    const buttonCollector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 75000 });

    buttonCollector.on('collect', async (i) => {
        // التحقق من أن اللاعب من الفريق
        const player = players.find(p => p.id === i.user.id);
        if (!player) return i.reply({ content: '🚫 أنت لست في الفريق.', ephemeral: true });

        // إنشاء قائمة الشراء (Select Menu)
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('merchant_select')
            .setPlaceholder('اختر سلعة للشراء...')
            .addOptions(
                SHOP_ITEMS.map(item => ({
                    label: item.name,
                    description: `${item.desc} | السعر: ${item.price} مورا`,
                    value: item.id,
                    emoji: item.emoji
                }))
            );

        const selectRow = new ActionRowBuilder().addComponents(selectMenu);

        // إرسال المنيو بشكل خاص (Ephemeral)
        const reply = await i.reply({ 
            content: `💰 **رصيدك الحالي:** جاري التحقق...\nاختر ما تريد شراءه بعناية:`, 
            components: [selectRow], 
            ephemeral: true,
            fetchReply: true 
        });

        // كوليكتر للقائمة المنسدلة (داخل الرد الخاص)
        const selectCollector = reply.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });

        selectCollector.on('collect', async (si) => {
            const selectedId = si.values[0];
            const item = SHOP_ITEMS.find(it => it.id === selectedId);

            // جلب رصيد اللاعب من الداتابيس الرئيسية
            const userBalance = sql.prepare("SELECT mora FROM levels WHERE user = ? AND guild = ?").get(si.user.id, guildId);
            const currentMora = userBalance ? userBalance.mora : 0;

            if (currentMora < item.price) {
                return si.reply({ content: `❌ **لا تملك مورا كافية!** تحتاج ${item.price} مورا.`, ephemeral: true });
            }

            // خصم المبلغ
            sql.prepare("UPDATE levels SET mora = mora - ? WHERE user = ? AND guild = ?").run(item.price, si.user.id, guildId);

            // تطبيق التأثير
            let effectMsg = "";
            
            if (selectedId === 'buy_elixir') {
                if (!player.isDead) {
                    // إذا كان حي، نعالجه بالكامل
                    player.hp = player.maxHp;
                    effectMsg = "شرب إكسير الحياة وشعر بقوة الخلود (HP كامل)!";
                } else {
                    // إحياء
                    player.isDead = false;
                    player.isPermDead = false; // كسر الموت النهائي
                    player.hp = Math.floor(player.maxHp * 0.5);
                    player.reviveCount = 0; // تصفير عداد الموت
                    effectMsg = "عاد من الموت بفضل إكسير الحياة!";
                }
            } 
            else if (selectedId === 'buy_blood') {
                player.maxHp = Math.floor(player.maxHp * 0.7); // خصم 30%
                if (player.hp > player.maxHp) player.hp = player.maxHp;
                player.effects.push({ type: 'atk_buff', val: 0.4, turns: 999 }); // بف دائم لنهاية الدانجون
                effectMsg = "وقّع عقد الدم! (HP انخفض، وهجومه زاد 40% لنهاية الرحلة)";
            }
            else if (selectedId === 'buy_shield') {
                player.shield = (player.shield || 0) + 5000;
                effectMsg = "تجهز بدرع المرتزقة الصلب! (+5000 درع)";
            }
            else if (selectedId === 'buy_map') {
                // تعديل المتغير المشترك للخريطة
                merchantState.skipFloors += 2;
                effectMsg = "اشترى خريطة سرية! سيتم تخطي الطابقين القادمين.";
            }
            else if (selectedId === 'buy_eye') {
                // تعديل المتغير المشترك للعين
                merchantState.weaknessActive = true;
                effectMsg = "حصل على عين البصيرة! وحش الطابق القادم سيكون مكشوفاً.";
            }

            await si.update({ content: `✅ **تم الشراء بنجاح!** خصم ${item.price} مورا.`, components: [] });
            
            // رسالة عامة في الثريد
            await thread.send(`🤝 **أبـرم ${player.name} صفـقـة مع التاجر واشتـرى ${item.name} مقابل ${item.price} ${EMOJI_MORA}**\n*${effectMsg}*`);
        });
    });

    buttonCollector.on('end', async () => {
        // تعطيل الزر الرئيسي
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
