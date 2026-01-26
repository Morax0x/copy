// handlers/dungeon/mystery-merchant.js

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, ButtonStyle, ComponentType, Colors } = require('discord.js');
const { EMOJI_MORA } = require('./constants');

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

const SHOP_ITEMS = [
    { id: 'buy_elixir', name: 'إكسيـر الحيـاة', price: 1800, desc: 'يعيد إحياءك بـ 100% HP (أو يعالجك بالكامل).', emoji: '🩸' },
    { id: 'buy_blood', name: 'عقـد الـدم', price: 1500, desc: 'خصم 50% من صحتك القصوى مقابل +60% هجوم دائم.', emoji: '📜' },
    { id: 'buy_map', name: 'خريطـة مختصـرة', price: 800, desc: 'تخطي 3 طوابق فوراً (حد أقصى 3 مرات بالغارة).', emoji: '🗺️' },
    { id: 'buy_shield', name: 'درع المرتزقـة', price: 2000, desc: 'يمنحك درعاً بـ 2500 نقطة يستمر حتى ينكسر أو لمدة 5 طوابق (مرة واحدة فقط).', emoji: '🛡️' },
    { id: 'buy_eye', name: 'عين البصيـرة', price: 800, desc: 'كشف نقطة ضعف وحش الطابق القادم (ضرر +50%).', emoji: '👁️' },
    { id: 'buy_instant_elder', name: 'شراب العمالقة العتيق', price: 1333, desc: 'تأثير فوري: يضاعف الصحة لمدة 8 طوابق!', emoji: '🍷' },
    { id: 'buy_instant_assassin', name: 'سم التخفي', price: 500, desc: 'تأثير فوري: يجعلك خفياً لـ 3 جولات قادمة.', emoji: '🌫️' }
];

function triggerMysteryMerchant(thread, players, sql, guildId, merchantState) {
    return new Promise(async (resolve) => {
        const randomQuote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
        let attackers = new Set();

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
                .setStyle(ButtonStyle.Secondary),
            
            new ButtonBuilder()
                .setCustomId('merchant_attack')
                .setLabel('اضـربــه')
                .setEmoji('⚔️')
                .setStyle(ButtonStyle.Danger)
        );

        const msg = await thread.send({ embeds: [embed], components: [row] });

        const buttonCollector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 45000 });

        buttonCollector.on('collect', async (i) => {
            const player = players.find(p => p.id === i.user.id);
            if (!player) return i.reply({ content: '🚫 أنت لست في الفريق.', ephemeral: true });

            // 🔥 منطق زر الهجوم 🔥
            if (i.customId === 'merchant_attack') {
                if (player.isDead) return i.reply({ content: '💀 الموتى لا يمكنهم القتال!', ephemeral: true });

                if (attackers.has(i.user.id)) {
                    return i.reply({ content: '😤 لقد ضربته بالفعل! انتظر بقية الفريق.', ephemeral: true });
                }

                attackers.add(i.user.id);
                const alivePlayersCount = players.filter(p => !p.isDead).length;
                const neededVotes = alivePlayersCount > 0 ? alivePlayersCount : 1;

                if (attackers.size >= neededVotes) {
                    await i.update({ content: `👊 **(${attackers.size}/${neededVotes}) ضرب مبـرح!** فرّ التاجر مذعوراً وتناثرت بضاعته...`, components: [] });
                    buttonCollector.stop('attacked');
                } else {
                    await i.reply({ content: `⚔️ **${player.name}** ضرب التاجر! (${attackers.size}/${neededVotes} للطرد)`, ephemeral: false }); 
                }
                return;
            }

            if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {});

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

            const selectCollector = reply.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 30000 });

            selectCollector.on('collect', async (si) => {
                const selectedId = si.values[0];
                const item = SHOP_ITEMS.find(it => it.id === selectedId);

                // 🔥 التحقق من حد شراء الخريطة ومنع التكديس 🔥
                if (selectedId === 'buy_map') {
                    // منع الشراء إذا كان هناك تخطي نشط
                    if (merchantState.skipFloors > 0) {
                        return si.reply({ content: `🚫 **هناك خريطة مفعلة بالفعل! لا يمكن تكديس الخرائط.**`, ephemeral: true });
                    }

                    merchantState.mapBuyCount = merchantState.mapBuyCount || 0;
                    if (merchantState.mapBuyCount >= 3) {
                        return si.reply({ content: `🚫 **لقد وصلتم للحد الأقصى (3 مرات) لشراء الخريطة في هذه الغارة!**`, ephemeral: true });
                    }
                }

                // 🔥🔥🔥 التحقق من حد شراء درع المرتزقة (مرة واحدة للشخص) 🔥🔥🔥
                if (selectedId === 'buy_shield') {
                    if (player.hasBoughtMercenaryShield) {
                        return si.reply({ content: `🚫 **لا يمكنك شراء درع المرتزقة أكثر من مرة واحدة في هذه الغارة!**`, ephemeral: true });
                    }
                }

                const freshBalance = sql.prepare("SELECT mora FROM levels WHERE user = ? AND guild = ?").get(si.user.id, guildId);
                const actualMora = freshBalance ? freshBalance.mora : 0;

                if (actualMora < item.price) {
                    return si.reply({ content: `❌ **لا تملك مورا كافية!** تحتاج ${item.price} مورا.`, ephemeral: true });
                }

                sql.prepare("UPDATE levels SET mora = mora - ? WHERE user = ? AND guild = ?").run(item.price, si.user.id, guildId);

                let effectMsg = "";

                if (selectedId === 'buy_elixir') {
                    if (!player.isDead) { player.hp = player.maxHp; effectMsg = "شرب إكسير الحياة وشعر بقوة الخلود (100% HP)!"; } 
                    else { player.isDead = false; player.isPermDead = false; player.hp = player.maxHp; player.reviveCount = 0; effectMsg = "عاد من الموت بكامل قوته بفضل إكسير الحياة!"; }
                } 
                else if (selectedId === 'buy_blood') {
                    player.maxHp = Math.floor(player.maxHp * 0.5); 
                    if (player.hp > player.maxHp) player.hp = player.maxHp;
                    player.effects.push({ type: 'atk_buff', val: 0.6, turns: 999 }); 
                    effectMsg = "وقّع عقد الدم! (انخفضت الصحة للنصف، وزاد هجومه 60% لنهاية الرحلة)";
                }
                else if (selectedId === 'buy_shield') {
                    // تطبيق فوري للدرع + الإعدادات
                    player.shield = (player.shield || 0) + 2500;
                    player.startingShield = 2500; 
                    player.shieldPersistent = true; 
                    player.shieldFloorsCount = 0; 
                    player.hasBoughtMercenaryShield = true; // منع التكرار
                    effectMsg = "تجهز بدرع المرتزقة الصلب! (2500 درع يستمر حتى ينكسر أو لمدة 5 طوابق)";
                }
                else if (selectedId === 'buy_map') {
                    merchantState.skipFloors += 3;
                    merchantState.mapBuyCount = (merchantState.mapBuyCount || 0) + 1;
                    effectMsg = `اشترى خريطة سرية! سيتم تخطي 3 طوابق قادمة. (استخدام ${merchantState.mapBuyCount}/3)`;
                }
                else if (selectedId === 'buy_eye') {
                    merchantState.weaknessActive = true;
                    effectMsg = "حصل على عين البصيرة! وحش الطابق القادم سيتلقى 50% ضرر إضافي.";
                }
                else if (selectedId === 'buy_instant_elder') {
                    player.maxHp *= 2; 
                    player.hp = player.maxHp;
                    // إضافة turns: 99 لضمان عدم اختفاء التأثير قبل انتهاء الطوابق
                    player.effects.push({ type: 'titan', floors: 8, turns: 99 }); 
                    effectMsg = "تجرع شراب العمالقة العتيق! تضاعفت صحته لمدة 8 طوابق!";
                }
                else if (selectedId === 'buy_instant_assassin') {
                    // 🔥 تصحيح: استخدام evasion بدلاً من stealth لأن المحرك يفهم evasion
                    player.effects.push({ type: 'evasion', turns: 3 }); 
                    effectMsg = "شرب سم التخفي! اختفى عن الأنظار لمدة 3 جولات.";
                }

                await si.update({ content: `✅ **تم الشراء بنجاح!** خصم ${item.price} مورا.\nالمتبقي: ${(actualMora - item.price).toLocaleString()}`, components: [] });
                await thread.send(`🤝 **أبـرم ${player.name} صفـقـة رابحة مع التاجر واشتـرى ${item.name} مقابل ${item.price} ${EMOJI_MORA}**\n*${effectMsg}*`);
            });
        });

        buttonCollector.on('end', async (collected, reason) => {
            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('merchant_view').setLabel('القـاء نظـرة').setEmoji('🛒').setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId('merchant_attack').setLabel('اضـربــه').setEmoji('⚔️').setStyle(ButtonStyle.Danger).setDisabled(true)
            );
            await msg.edit({ components: [disabledRow] }).catch(() => {});
            
            if (reason !== 'attacked') {
                await thread.send("🌑 **اختفى التاجر في الظلال كما ظهر...**");
            }
            
            resolve();
        });
    });
}

module.exports = { triggerMysteryMerchant };
