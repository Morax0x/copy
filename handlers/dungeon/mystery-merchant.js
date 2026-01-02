const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, ButtonStyle, ComponentType, Colors } = require('discord.js');
const { EMOJI_MORA, EMOJI_BUFF, EMOJI_NERF } = require('./constants'); // تأكد من وجود ملف constants.js

// قائمة الجمل العشوائية للتاجر
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
    "«إن كنت تبحث عن الأمل… فهو ليس مجانيًا.»",
    "«الموت مجاني… أما النجاة فلها ثمن.»",
    "«ادخل الدانجون بثقة… واخرج إن دفعت.»",
    "«عناصري لا تلمع… لكنها تبقيك حيًّا.»",
    "«الجبن يقتلك أسرع من الوحوش.»",
    "«الصفقة الآن… أو العظام لاحقًا.»",
    "«الكنز ينتظر الشجعان… وأنا أنتظر المورا.»",
    "«الخطوة الخاطئة تكلف روحك… إلا إن اشتريت.»",
    "«ليست بضاعة… إنها فرصة للعودة.»",
    "«الوحوش لا تفاوض… أنا أفعل.»"
];

// قائمة البضائع
const SHOP_ITEMS = [
    // --- البضائع القديمة (الخاصة) ---
    {
        id: 'buy_elixir',
        name: 'إكسيـر الحيـاة',
        price: 3000,
        desc: 'يعيد إحياءك بـ 100% HP (أو يعالجك بالكامل).',
        emoji: '🩸'
    },
    {
        id: 'buy_blood',
        name: 'عقـد الـدم',
        price: 1500,
        desc: 'خصم 30% من صحتك القصوى مقابل +60% هجوم دائم.',
        emoji: '📜'
    },
    {
        id: 'buy_map',
        name: 'خريطـة مختصـرة',
        price: 3000,
        desc: 'تخطي 3 طوابق فوراً مع الحصول على جوائزهم.',
        emoji: '🗺️'
    },
    {
        id: 'buy_shield',
        name: 'درع المرتزقـة',
        price: 1000,
        desc: 'يمنحك درعاً بـ 2500 نقطة يستمر حتى ينكسر.',
        emoji: '🛡️'
    },
    {
        id: 'buy_eye',
        name: 'عين البصيـرة',
        price: 800,
        desc: 'كشف نقطة ضعف وحش الطابق القادم (ضرر +50%).',
        emoji: '👁️'
    },
    // --- الفكرة 1: مخزون الطوارئ (تضاف للمخزون) ---
    {
        id: 'buy_stock_titan',
        name: 'مخزون: جرعة العملاق',
        price: 1000, 
        desc: 'تضاف للحقيبة. (تضاعف الصحة لـ 5 طوابق).',
        emoji: '📦'
    },
    {
        id: 'buy_stock_time',
        name: 'مخزون: جرعة الزمن',
        price: 600, 
        desc: 'تضاف للحقيبة. (تصفير المهارات).',
        emoji: '📦'
    },
    {
        id: 'buy_stock_reflect',
        name: 'مخزون: جرعة الانعكاس',
        price: 350, 
        desc: 'تضاف للحقيبة. (تعكس الضرر).',
        emoji: '📦'
    },
    // --- الفكرة 2: الجرعات المركزة (تأثير فوري) ---
    {
        id: 'buy_instant_elder',
        name: 'شراب العمالقة العتيق',
        price: 2500,
        desc: 'تأثير فوري: يضاعف الصحة لمدة 8 طوابق!',
        emoji: '🍷'
    },
    {
        id: 'buy_instant_assassin',
        name: 'سم التخفي',
        price: 2000,
        desc: 'تأثير فوري: يجعلك خفياً لـ 3 جولات قادمة.',
        emoji: '🌫️'
    }
];

async function triggerMysteryMerchant(thread, players, sql, guildId, merchantState) {
    const randomQuote = QUOTES[Math.floor(Math.random() * QUOTES.length)];

    const embed = new EmbedBuilder()
        .setTitle('★ التـاجـر المتجـول ظهـر !')
        .setDescription(`> **"${randomQuote}"**\n\nيَعرض بضائع نادرة بأسعار سوق سوداء.. هل تجرؤ على الشراء؟\n\n⏳ **يغادر بعد 45 ثانية...**`)
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

    // كوليكتور الزر الرئيسي (إلقاء نظرة)
    const buttonCollector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 45000 });

    buttonCollector.on('collect', async (i) => {
        if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});

        const player = players.find(p => p.id === i.user.id);
        if (!player) return i.followUp({ content: '🚫 أنت لست في الفريق.', ephemeral: true });

        // جلب رصيد اللاعب من قاعدة البيانات
        const userBalance = sql.prepare("SELECT mora FROM levels WHERE user = ? AND guild = ?").get(i.user.id, guildId);
        const currentMora = userBalance ? userBalance.mora : 0;

        // إنشاء قائمة المنتجات
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

        // كوليكتور القائمة (الشراء الفعلي)
        const selectCollector = reply.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 30000 });

        selectCollector.on('collect', async (si) => {
            const selectedId = si.values[0];
            const item = SHOP_ITEMS.find(it => it.id === selectedId);

            // التحقق من الرصيد مرة أخرى قبل الخصم
            const freshBalance = sql.prepare("SELECT mora FROM levels WHERE user = ? AND guild = ?").get(si.user.id, guildId);
            const actualMora = freshBalance ? freshBalance.mora : 0;

            if (actualMora < item.price) {
                return si.reply({ content: `❌ **لا تملك مورا كافية!** تحتاج ${item.price} مورا.`, ephemeral: true });
            }

            // خصم المبلغ
            sql.prepare("UPDATE levels SET mora = mora - ? WHERE user = ? AND guild = ?").run(item.price, si.user.id, guildId);

            let effectMsg = "";

            // --- تطبيق تأثير المشتريات ---

            if (selectedId === 'buy_elixir') {
                if (!player.isDead) {
                    player.hp = player.maxHp;
                    effectMsg = "شرب إكسير الحياة وشعر بقوة الخلود (100% HP)!";
                } else {
                    player.isDead = false;
                    player.isPermDead = false;
                    player.hp = player.maxHp; 
                    player.reviveCount = 0;
                    effectMsg = "عاد من الموت بكامل قوته بفضل إكسير الحياة!";
                }
            } 
            else if (selectedId === 'buy_blood') {
                player.maxHp = Math.floor(player.maxHp * 0.7); 
                if (player.hp > player.maxHp) player.hp = player.maxHp;
                player.effects.push({ type: 'atk_buff', val: 0.6, turns: 999 }); 
                effectMsg = "وقّع عقد الدم! (HP انخفض، وهجومه زاد 60% لنهاية الرحلة)";
            }
            else if (selectedId === 'buy_shield') {
                player.startingShield = 2500; // الدرع 2500
                player.shieldPersistent = true; // يستمر حتى ينكسر
                effectMsg = "تجهز بدرع المرتزقة الصلب! (2500 درع يستمر حتى ينكسر)";
            }
            else if (selectedId === 'buy_map') {
                merchantState.skipFloors += 3; // تعديل الحالة العامة للتاجر/المرحلة
                effectMsg = "اشترى خريطة سرية! سيتم تخطي 3 طوابق قادمة.";
            }
            else if (selectedId === 'buy_eye') {
                merchantState.weaknessActive = true;
                effectMsg = "حصل على عين البصيرة! وحش الطابق القادم سيتلقى 50% ضرر إضافي.";
            }
            
            // --- عناصر المخزون (تخزن في الداتا بيس) ---
            else if (selectedId.startsWith('buy_stock_')) {
                let potionId = '';
                if (selectedId === 'buy_stock_titan') potionId = 'potion_titan';
                else if (selectedId === 'buy_stock_time') potionId = 'potion_time';
                else if (selectedId === 'buy_stock_reflect') potionId = 'potion_reflect';

                // إضافة للحقيبة (SQL)
                sql.prepare(`
                    INSERT INTO user_inventory (userID, guildID, itemID, quantity) 
                    VALUES (?, ?, ?, 1) 
                    ON CONFLICT(userID, guildID, itemID) 
                    DO UPDATE SET quantity = quantity + 1
                `).run(player.id, guildId, potionId);

                effectMsg = `اشترى ${item.name} وتم إخفاؤها في حقيبته لاستخدامها لاحقاً.`;
            }

            // --- جرعات فورية التأثير ---
            else if (selectedId === 'buy_instant_elder') {
                player.maxHp *= 2; 
                player.hp = player.maxHp;
                // ملاحظة: تأكد أن اللوب الرئيسي يعالج خاصية 'floors' في التأثيرات
                player.effects.push({ type: 'titan', floors: 8 }); 
                effectMsg = "تجرع شراب العمالقة العتيق! تضاعفت صحته لمدة 8 طوابق!";
            }
            else if (selectedId === 'buy_instant_assassin') {
                player.effects.push({ type: 'stealth', turns: 3 });
                effectMsg = "شرب سم التخفي! اختفى عن الأنظار لمدة 3 جولات.";
            }

            // تأكيد الشراء للمستخدم وتحديث التفاعل
            await si.update({ content: `✅ **تم الشراء بنجاح!** خصم ${item.price} مورا.\nالمتبقي: ${(actualMora - item.price).toLocaleString()}`, components: [] });
            
            // إرسال رسالة عامة للشات
            await thread.send(`🤝 **أبـرم ${player.name} صفـقـة رابحة مع التاجر واشتـرى ${item.name} مقابل ${item.price} ${EMOJI_MORA}**\n*${effectMsg}*`);
        });
    });

    // عند انتهاء وقت التاجر
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
