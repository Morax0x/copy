const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    Colors,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

const { 
    dungeonConfig, 
    EMOJI_MORA, 
    EMOJI_XP, 
    EMOJI_BUFF, 
    EMOJI_NERF, 
    OWNER_ID, 
    WIN_IMAGES, 
    LOSE_IMAGES,
    skillsConfig 
} = require('./dungeon/constants');

const { 
    ensureInventoryTable, 
    getRandomImage, 
    getBaseFloorMora, 
    applyDamageToPlayer, 
    getRealPlayerData 
} = require('./dungeon/utils');

const { 
    getRandomMonster, 
    getSmartTarget, 
    GENERIC_MONSTER_SKILLS, 
    MONSTER_SKILLS 
} = require('./dungeon/monsters');

const { handleSkillUsage } = require('./dungeon/skills');

const { 
    buildSkillSelector, 
    buildPotionSelector, 
    generateBattleEmbed, 
    generateBattleRows 
} = require('./dungeon/ui');

// 🔥 استدعاء ملف الصناديق والتاجر 🔥
const { triggerMimicChest } = require('./dungeon/mimic-chest');
const { triggerMysteryMerchant } = require('./dungeon/mystery-merchant');

// 🔥 دالة لتنظيف الاسم 🔥
function cleanName(name) {
    if (!name) return "Unknown";
    const separators = ['»', '•', '✦', '★', '❖', '✧', '✬', '〢', '┇', '\\|', '~', '⚡'];
    const regex = new RegExp(`\\s*([${separators.join('')}]).*`, 'g');
    return name.replace(regex, '').trim();
}

// 🔥 دالة فحص الموت (تستخدم لتحديث الحالة فوراً) 🔥
function checkDeaths(players, floor, log, threadChannel) {
    players.forEach(p => {
        if (!p.isDead && p.hp <= 0) {
            p.hp = 0;
            p.isDead = true;
            p.deathFloor = floor;
            
            // لو كان كاهن، يعالج الفريق قبل موته
            if (p.class === 'Priest' && !p.isPermDead) {
                players.forEach(m => { if(!m.isDead) m.hp = Math.min(m.maxHp, m.hp + Math.floor(m.maxHp * 0.4)); });
                log.push(`⚰️ **سقـط الكـاهـن** - قـام بعلاج الفريق على الرمق الاخـير!`);
                threadChannel.send(`✨⚰️ **${p.name}** سقـط ولكنه عالج الفريق قبل موته!`).catch(()=>{});
            }

            if (p.reviveCount >= 1) {
                p.isPermDead = true;
                log.push(`💀 **${p.name}** سقط وتحللت جثته!`);
                threadChannel.send(`💀 **${p.name}** سقط وتحللت جثته - لا يمكن إحياؤه!`).catch(()=>{});
            } else {
                log.push(`💀 **${p.name}** سقط!`);
                threadChannel.send(`💀 **${p.name}** سقط في أرض المعركة!`).catch(()=>{});
            }
        }
    });
}

// --- Main Dungeon Execution Logic ---

async function runDungeon(threadChannel, mainChannel, partyIDs, theme, sql, hostId, partyClasses, activeDungeonRequests) {
    const guild = threadChannel.guild;
    
    // حماية إضافية للتحقق من اتصال قاعدة البيانات
    if (!sql || !sql.open) {
        return threadChannel.send("⚠️ **خطأ تقني:** قاعدة البيانات غير متصلة حالياً، الرجاء المحاولة لاحقاً.").catch(() => {});
    }
    ensureInventoryTable(sql); 

    let players = [];
    let retreatedPlayers = []; 
    
    // --- متغيرات الأحداث ---
    let isTrapActive = false;
    let trapStartFloor = 0;
    
    // 🔥 متغيرات التحكم في التكرار والتناوب 🔥
    let lastEventFloor = -10; // الطابق الذي وقع فيه آخر حدث
    let lastEventType = null; // نوع آخر حدث ('merchant' أو 'chest')

    // متغيرات التاجر (مشتركة)
    let merchantState = {
        skipFloors: 0,
        weaknessActive: false
    };

    const promises = partyIDs.map(id => guild.members.fetch(id).catch(() => null));
    const members = await Promise.all(promises);

    members.forEach((m, index) => {
        if (m) {
            const cls = partyClasses.get(m.id) || 'Adventurer';
            let playerData = getRealPlayerData(m, sql, cls);
            
            // تنظيف الاسم فوراً
            playerData.name = cleanName(playerData.name);
            // تهيئة متغير الدرع المشتراة
            playerData.startingShield = 0; 
            
            // ============================================================
            // 🔥🔥🔥 الفحص الحقيقي للختم (Deep Scan) 🔥🔥🔥
            // ============================================================
            playerData.isSealed = false;
            playerData.sealMultiplier = 1.0; 
            
            if (m.id !== OWNER_ID) {
                let maxItemLevel = 0;

                // 1. فحص المهارات (Skills)
                if (playerData.skills && typeof playerData.skills === 'object') {
                    const skillValues = Object.values(playerData.skills);
                    for (const skill of skillValues) {
                        const lvl = parseInt(skill.currentLevel) || parseInt(skill.level) || 0;
                        if (lvl > maxItemLevel) maxItemLevel = lvl;
                    }
                }

                // 2. فحص السلاح (Weapon)
                if (playerData.weapon && typeof playerData.weapon === 'object') {
                    const wLvl = parseInt(playerData.weapon.currentLevel) || parseInt(playerData.weapon.level) || parseInt(playerData.weapon.lvl) || 0;
                    if (wLvl > maxItemLevel) maxItemLevel = wLvl;
                }

                // 3. قرار الختم
                if (maxItemLevel > 10) {
                    playerData.isSealed = true;
                    playerData.sealMultiplier = 0.2; // البداية 20%
                }
            }
            // ============================================================

            players.push(playerData);
        }
    });

    if (players.length === 0) {
        activeDungeonRequests.delete(hostId);
        return threadChannel.send("❌ خطأ: لم يتم العثور على اللاعبين.").catch(() => {});
    }

    // 🔥🔥🔥 رسالة الختم (تظهر في البداية للمختومين فقط) 🔥🔥🔥
    players.forEach(p => {
        if (p.isSealed) {
             threadChannel.send(`✶ <@${p.id}> تـم ختـم قوتك الى الطابـق 18 لن تتمكن من استعمال قوتك جيدا, الطوابق الدنيا لا تتحمل جبروتك`).catch(() => {});
        }
    });

    const maxFloors = 100; 
    let totalAccumulatedCoins = 0;
    let totalAccumulatedXP = 0;

    for (let floor = 1; floor <= maxFloors; floor++) {
        // التحقق من اللاعبين
        if (players.length === 0 || players.every(p => p.isDead)) break; 

        // 🔥 تطبيق تخطي الطوابق (الخريطة المختصرة أو بوابة الأبعاد) 🔥
        if (merchantState.skipFloors > 0) {
            // نأخذ القفزة كاملة في دورة واحدة
            const floorsSkipped = merchantState.skipFloors;
            merchantState.skipFloors = 0; // تصفير
            
            // تحديث رقم الطابق
            const oldFloor = floor;
            floor += floorsSkipped; 
            if (floor > maxFloors) floor = maxFloors; // سقف للطوابق

            try {
                await threadChannel.send(`⏩ **انتقال سريع!** تم القفز من الطابق ${oldFloor} إلى ${floor}.`);
            } catch (err) {
                console.log("Error sending message (Unknown Channel likely):", err.message);
                break; // نوقف الدانجون إذا الروم انحذف
            }
            continue; // ننتقل للدورة التالية (الطابق الجديد)
        }

        // 🔥🔥🔥 التدرج في فك الختم 🔥🔥🔥
        
        // 1. الطابق 15: فك جزئي (تصير القوة 50% - نصف الختم)
        if (floor === 15) {
            players.forEach(p => {
                if (p.isSealed && !p.isDead) {
                    p.sealMultiplier = 0.5; // نصف القوة
                    threadChannel.send(`✶ <@${p.id}> كسرت الختم بشكل جزئي عن قوتـك .. استـمر !`).catch(() => {});
                }
            });
        }

        // 2. الطابق 19: فك كامل (تصير القوة 100%)
        if (floor === 19) {
            players.forEach(p => {
                if (p.isSealed && !p.isDead) {
                    p.isSealed = false; 
                    p.sealMultiplier = 1.0;
                    threadChannel.send(`✶ <@${p.id}> تـم كـسـر الخـتم عنك واطلق العنان لقوتك، لك الآن الحُرّيـة الكامـلة في استعمالها`).catch(() => {});
                }
            });
        }

        // 🔥 الحفاظ على الدروع والبفات المهمة فقط 🔥
        for (let p of players) {
            if (!p.isDead) { 
                // تطبيق الدرع
                p.shield = p.startingShield || 0;
                p.startingShield = 0; 

                // الحفاظ على البفات (سم، قوة، ضعف)
                p.effects = p.effects.filter(e => ['poison', 'atk_buff', 'weakness'].includes(e.type));
                
                p.defending = false; 
                p.summon = null; 
            } 
        }

        const floorConfig = dungeonConfig.floors.find(f => f.floor === floor) || dungeonConfig.floors[dungeonConfig.floors.length - 1];
        const randomMob = getRandomMonster(floorConfig.type, theme);

        let finalHp, finalAtk;
        
        if (floor <= 10) {
            const baseFloorHP = 300 + ((floor - 1) * 100);
            const baseAtk = 15 + (floor * 3);
            finalHp = Math.floor(baseFloorHP * (floorConfig.hp_mult || 1));
            finalAtk = Math.floor(baseAtk * (floorConfig.atk_mult || 1));
        } else {
            const tier = floor - 10;
            const baseFloorHP = 1200 + (Math.pow(tier, 2) * 50); 
            const baseAtk = 45 + (tier * 5); 
            finalHp = Math.floor(baseFloorHP * (floorConfig.hp_mult || 1));
            finalAtk = Math.floor(baseAtk * (floorConfig.atk_mult || 1));
        }

        let monster = {
            name: `${randomMob.name} (Lv.${floor})`, 
            hp: finalHp, maxHp: finalHp, atk: finalAtk, 
            enraged: false, effects: [], targetFocusId: null, frozen: false 
        };

        // تطبيق عين البصيرة
        if (merchantState.weaknessActive) {
            monster.effects.push({ type: 'weakness', val: 0.25, turns: 99 });
            merchantState.weaknessActive = false;
        }

        let log = [`⚠️ **الطابق ${floor}/${maxFloors}**: ظهر **${monster.name}**! (HP: ${monster.maxHp.toLocaleString()} | DMG: ${monster.atk})`];
        if (monster.effects.some(e => e.type === 'weakness')) log.push(`👁️ **تم كشف نقطة ضعف الوحش!** (+25% ضرر إضافي)`);

        let ongoing = true;
        let turnCount = 0;

        let battleMsg;
        try {
            battleMsg = await threadChannel.send({ 
                embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])], 
                components: generateBattleRows() 
            });
        } catch (err) {
            console.log("Dungeon Stop: Thread likely deleted.");
            break;
        }

        while (ongoing) {
            const collector = battleMsg.createMessageComponentCollector({ time: 24 * 60 * 60 * 1000 });
            let actedPlayers = [];
            let processingUsers = new Set(); 

            await new Promise(resolve => {
                const turnTimeout = setTimeout(async () => { 
                    const afkPlayers = players.filter(p => !p.isDead && !actedPlayers.includes(p.id));
                    
                    if (afkPlayers.length > 0) {
                        for (const afkP of afkPlayers) {
                            afkP.skipCount = (afkP.skipCount || 0) + 1;
                            
                            if (afkP.skipCount >= 5) {
                                afkP.hp = 0;
                                afkP.isDead = true;
                                afkP.isPermDead = true; 
                                afkP.deathFloor = floor; 
                                
                                const debuffDuration = 60 * 60 * 1000; 
                                const expiresAt = Date.now() + debuffDuration;
                                
                                if (sql.open) {
                                    sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guild.id, afkP.id, -100, expiresAt, 'mora', -1.0);
                                    sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guild.id, afkP.id, -100, expiresAt, 'xp', -1.0);
                                }

                                log.push(`☠️ **${afkP.name}** ابتـلعـه الدانـجون بسبب الخمـول!`);
                                
                                await threadChannel.send(`✶ <@${afkP.id}> <:emoji_69:1451172248173023263> خـرقـت قوانين الدانجـون بسبب خمولك المستمـر ابتعلك الدانجـون و تـم لعنـك بمقدار 100%- على مكاسب المورا والاكس بي 60د <a:Nerf:1438795685280612423>`).catch(()=>{});
                            } else {
                                monster.targetFocusId = afkP.id; 
                                actedPlayers.push(afkP.id); 
                                await threadChannel.send(`<:downward:1435880484046372914> <@${afkP.id}> تم تخطي دورك بسبب عدم الاستجابة! (تحذير ${afkP.skipCount}/5) الوحش يركز هجماتـه عليك!`).catch(()=>{});
                            }
                        }
                        
                        // 🔥🔥 تحقق من موت الجميع بسبب الخمول 🔥🔥
                        if (players.every(p => p.isDead)) {
                            ongoing = false;
                            collector.stop('all_dead');
                            return;
                        }
                        
                        log.push(`⚠️ تم تخطي دور اللاعبين الخاملين.`);
                        collector.stop('turn_end'); 
                    } else {
                        collector.stop('turn_end');
                    }
                }, 45000); 

                collector.on('collect', async i => {
                    
                    // ============================================================
                    // 👑 القسم الأول: منطق الإمبراطور (القوائم والمهارات) 👑
                    // ============================================================
                    
                    if (i.customId === 'def' && i.user.id === OWNER_ID) {
                        const menu = new StringSelectMenuBuilder()
                            .setCustomId('owner_god_menu_category')
                            .setPlaceholder('👑 اختر قسم القوة المطلقة')
                            .addOptions([
                                { label: 'الإمبراطـور', description: 'مهارات الوجود والعدم', value: 'cat_emperor', emoji: '👑' },
                                { label: 'الأعـراق', description: 'جميع مهارات الأعراق', value: 'cat_races', emoji: '🧬' },
                                { label: 'التصنيفـات', description: 'مهارات الكلاسات الخاصة', value: 'cat_classes', emoji: '⚔️' },
                                { label: 'مهـارات عامة', description: 'المهارات الأساسية بقوة مضاعفة', value: 'cat_skills', emoji: '📜' },
                            ]);
                        
                        const ownerMenuMsg = await i.reply({ 
                            content: `**👑 مرحباً مولاي الإمبراطور..**\nاختر التصنيف لاستدعاء القوة:`, 
                            components: [new ActionRowBuilder().addComponents(menu)], 
                            ephemeral: true,
                            fetchReply: true 
                        });

                        const menuCollector = ownerMenuMsg.createMessageComponentCollector({ 
                            filter: subI => subI.user.id === i.user.id, 
                            time: 60000 
                        });

                        menuCollector.on('collect', async subI => {
                            // 🛠️ معالجة اختيار التصنيف
                            if (subI.customId === 'owner_god_menu_category') {
                                const category = subI.values[0];
                                let options = [];

                                if (category === 'cat_emperor') {
                                    // 🔥 إضافة مهارة شق الزمكان هنا يدوياً للمالك فقط 🔥
                                    options.push({ label: 'شق الزمكان', description: 'إنهاء الدانجون فوراً واحتساب الغنائم (انسحاب تكتيكي)', value: 'skill_owner_leave', emoji: '🌌' });
                                    
                                    const otherSkills = skillsConfig.filter(s => s.stat_type === 'Owner').map(s => ({
                                        label: s.name, description: s.description.substring(0, 100), value: s.id, emoji: s.emoji
                                    }));
                                    options.push(...otherSkills);

                                } else if (category === 'cat_races') {
                                    options = skillsConfig.filter(s => s.id.startsWith('race_')).map(s => ({
                                        label: s.name, description: `(x10 DMG) ${s.description}`.substring(0, 100), value: s.id, emoji: s.emoji
                                    }));
                                } else if (category === 'cat_classes') {
                                    options = [
                                        { label: 'صرخة الحرب', description: 'بفات للفريق', value: 'class_Leader', emoji: '⚔️' },
                                        { label: 'استفزاز', description: 'سحب الضرر ودفاع', value: 'class_Tank', emoji: '🛡️' },
                                        { label: 'النور المقدس', description: 'إحياء وعلاج', value: 'class_Priest', emoji: '✨' },
                                        { label: 'سجن الجليد', description: 'تجميد الوحش', value: 'class_Mage', emoji: '❄️' },
                                        { label: 'حارس الظل', description: 'استدعاء وحش', value: 'class_Summoner', emoji: '🐺' }
                                    ];
                                } else if (category === 'cat_skills') {
                                    options = skillsConfig.filter(s => !s.id.startsWith('race_') && s.stat_type !== 'Owner').map(s => ({
                                        label: s.name, description: `(x10 Effect) ${s.description}`.substring(0, 100), value: s.id, emoji: s.emoji
                                    }));
                                }

                                if (options.length === 0) return subI.reply({ content: "لا توجد مهارات هنا.", ephemeral: true });

                                const skillMenu = new StringSelectMenuBuilder()
                                    .setCustomId('owner_god_menu_execute')
                                    .setPlaceholder('⚡ اختر المهارة للتنفيذ فوراً')
                                    .addOptions(options.slice(0, 25));

                                await subI.update({ 
                                    content: `**👑 تصنيف: ${category.replace('cat_', '').toUpperCase()}**\nاختر المهارة لإطلاقها:`, 
                                    components: [new ActionRowBuilder().addComponents(skillMenu)] 
                                });
                            }

                            // 🛠️ معالجة تنفيذ المهارة
                            if (subI.customId === 'owner_god_menu_execute') {
                                const skillID = subI.values[0];
                                
                                // تعريف مهارة شق الزمكان يدوياً في كائن المهارة لتجنب الخطأ
                                let skillObj = skillsConfig.find(s => s.id === skillID);
                                if (skillID === 'skill_owner_leave') {
                                    skillObj = { id: 'skill_owner_leave', name: 'شق الزمكان', base_price: 0 };
                                } else if (!skillObj && skillID.startsWith('class_')) {
                                    skillObj = { id: skillID, name: skillID, base_price: 0 };
                                }
                                
                                let p = players.find(pl => pl.id === subI.user.id);
                                if (!p) return;

                                const result = handleSkillUsage(p, skillObj, monster, log, threadChannel, players);

                                // ⚡🔥 معالجة بوابة الأبعاد (نقل الطوابق) 🔥⚡
                                if (result.type === 'dimension_gate_request') {
                                    const modal = new ModalBuilder()
                                        .setCustomId('modal_dimension_gate')
                                        .setTitle('🌌 بوابة الأبعاد');
                                    const floorInput = new TextInputBuilder()
                                        .setCustomId('gate_floor_number')
                                        .setLabel("رقم الطابق الذي تريد الانتقال له؟")
                                        .setStyle(TextInputStyle.Short)
                                        .setPlaceholder("مثال: 50")
                                        .setRequired(true);
                                    const rewardInput = new TextInputBuilder()
                                        .setCustomId('gate_rewards_choice')
                                        .setLabel("هل تريد جوائز الطوابق المتخطاة؟")
                                        .setStyle(TextInputStyle.Short)
                                        .setPlaceholder("نعم / لا")
                                        .setRequired(false);
                                    modal.addComponents(new ActionRowBuilder().addComponents(floorInput), new ActionRowBuilder().addComponents(rewardInput));
                                    
                                    await subI.showModal(modal);

                                    try {
                                        const modalInteraction = await subI.awaitModalSubmit({
                                            filter: (m) => m.customId === 'modal_dimension_gate' && m.user.id === subI.user.id,
                                            time: 30000 
                                        });

                                        const floorNum = parseInt(modalInteraction.fields.getTextInputValue('gate_floor_number'));
                                        const wantRewards = modalInteraction.fields.getTextInputValue('gate_rewards_choice')?.toLowerCase().includes('نعم');

                                        if (isNaN(floorNum) || floorNum <= floor) {
                                            await modalInteraction.reply({ content: "❌ رقم طابق غير صالح!", ephemeral: true });
                                            return;
                                        }

                                        const jump = floorNum - floor - 1; 
                                        merchantState.skipFloors = jump; 
                                        
                                        if (wantRewards) {
                                            const extraMora = jump * 500;
                                            players.forEach(p => { if (!p.isDead) p.loot.mora += extraMora; });
                                            log.push(`💰 **الإمبراطور** نهب جوائز ${jump} طابق! (+${extraMora} مورا)`);
                                        }

                                        monster.hp = 0; 
                                        log.push(`🌌 **بوابة الأبعاد** فُتحت! الانتقال إلى الطابق ${floorNum}...`);
                                        await modalInteraction.reply({ content: "🌌 جاري الانتقال...", ephemeral: true });
                                        
                                        collector.stop('monster_dead');
                                        return; 

                                    } catch (err) {
                                        return;
                                    }
                                }

                                // ⚡🔥 معالجة شق الزمكان (انسحاب الاونر والفريق) 🔥⚡
                                if (result.type === 'owner_leave' || skillID === 'skill_owner_leave') {
                                     // التحقق الصارم
                                     if (subI.user.id !== OWNER_ID) return;

                                     await subI.update({ content: "💨 **تم تنفيذ شق الزمكان! إنهاء المعركة فوراً...**", components: [] });
                                     
                                     // إنهاء الدانجون كـ "انسحاب" للجميع
                                     // نقوم بإيقاف الكوليكتور ونرسل رسالة الانسحاب
                                     await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, floor, "retreat", sql, guild.id, hostId, activeDungeonRequests);
                                     ongoing = false; // إيقاف اللوب
                                     collector.stop('owner_force_leave');
                                     return;
                                }

                                if (result.success) {
                                    actedPlayers.push(p.id);
                                    p.skipCount = 0;
                                    await subI.update({ content: "✅ تم التنفيذ!", components: [] });
                                    
                                    if (monster.hp <= 0) {
                                        monster.hp = 0;
                                        ongoing = false;
                                        collector.stop('monster_dead');
                                        return; 
                                    }

                                    if (actedPlayers.length >= players.filter(pl => !pl.isDead).length) { 
                                        clearTimeout(turnTimeout); collector.stop('turn_end'); 
                                    } else {
                                        await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] }).catch(()=>{});
                                    }
                                }
                            }
                        });
                        return; // نخرج من الدالة الحالية
                    }

                    // ============================================================
                    // 👑 القسم الثاني: التحقق التلقائي لدخول الاونر 👑
                    // ============================================================
                    if (i.user.id === OWNER_ID && !players.find(p => p.id === OWNER_ID)) {
                        const member = await i.guild.members.fetch(OWNER_ID).catch(() => null);
                        if (member) {
                             const ownerPlayer = getRealPlayerData(member, sql, '???'); 
                             ownerPlayer.name = cleanName(ownerPlayer.name);
                             players.push(ownerPlayer);
                             log.push(`👑 **الأمبراطـور اقتحـم المعركـة!**`);
                        }
                    }


                    // ============================================================
                    // ⚔️ القسم الثالث: المنطق العادي (اللاعبين العاديين) ⚔️
                    // ============================================================
                    
                    if (!i.replied && !i.deferred && !i.isStringSelectMenu() && !i.isModalSubmit()) await i.deferUpdate().catch(()=>{});
                    
                    if (processingUsers.has(i.user.id)) return i.followUp({ content: "🚫 اهدأ! طلبك قيد المعالجة.", ephemeral: true }).catch(()=>{});
                    
                    let p = players.find(pl => pl.id === i.user.id);
                    if (!p) return i.followUp({ content: "🚫 لست مشاركاً!", ephemeral: true });
                    if (p.isDead || actedPlayers.includes(p.id)) return;

                    // 🔥🔥 تحقق من الشلل (Stun Check) - مع التحديث 🔥🔥
                    if (p.effects.some(e => e.type === 'stun')) {
                        await i.followUp({ content: "🚫 **أنت مشلول ولا تستطيع الحركة هذا الدور!**", ephemeral: true });
                        actedPlayers.push(p.id); 
                        p.skipCount = 0; 
                        log.push(`❄️ **${p.name}** مشلول ولم يستطع التحرك!`);
                        
                        await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] }).catch(()=>{});

                        if (actedPlayers.length >= players.filter(pl => !pl.isDead).length) { 
                            clearTimeout(turnTimeout); 
                            collector.stop('turn_end'); 
                        }
                        return;
                    }
                    
                    processingUsers.add(i.user.id);

                    try {
                        if (i.customId === 'skill') {
                            const skillRow = buildSkillSelector(p);
                            if (!skillRow) {
                                await i.followUp({ content: "❌ لا توجد مهارات.", ephemeral: true });
                                processingUsers.delete(i.user.id); return;
                            }
                            try {
                                const skillMsg = await i.followUp({ content: "✨ **اختر المهارة:**", components: [skillRow], ephemeral: true });
                                const selection = await skillMsg.awaitMessageComponent({ filter: subI => subI.user.id === i.user.id, time: 10000 });
                                await selection.deferUpdate().catch(()=>{}); 

                                const skillId = selection.values[0];
                                
                                const shieldSkills = ['skill_shielding', 'race_human_skill'];
                                if (shieldSkills.includes(skillId) && p.shield > 0) {
                                    await selection.followUp({ content: `🛡️ **لديك درع نشط بالفعل!**`, ephemeral: true });
                                    processingUsers.delete(i.user.id); return; 
                                }

                                let skillNameUsed = "مهارة";
                                let skillObj = { id: skillId, name: 'Skill', effectValue: 0 };
                                
                                if (!skillId.startsWith('class_') && skillId !== 'class_special_skill' && skillId !== 'skill_secret_owner' && skillId !== 'skill_owner_leave') {
                                     if (p.skills[skillId]) skillObj = p.skills[skillId];
                                }

                                // 🔥🔥🔥 نيرف المهارات مع سقف الدمج 🔥🔥🔥
                                let originalAtk = p.atk;
                                
                                // تطبيق الختم (فقط للمختومين)
                                if (p.isSealed) {
                                    p.atk = Math.floor(p.atk * p.sealMultiplier); 
                                    if (skillObj.effectValue) {
                                        skillObj = { ...skillObj, effectValue: Math.floor(skillObj.effectValue * p.sealMultiplier) };
                                    }
                                }
                                // تطبيق سقف الدمج الصارم (للجميع) في الطوابق الأولى
                                // هنا نضعف الـ ATK نفسه قبل المعادلة لضمان عدم تجاوز السقف
                                if (floor <= 5 && p.atk > 47) p.atk = 47;
                                else if (floor <= 10 && p.atk > 88) p.atk = 88;
                                else if (floor <= 14 && p.atk > 120) p.atk = 120;

                                const res = handleSkillUsage(p, { ...skillObj, id: skillId }, monster, log, threadChannel, players);
                                
                                // 🔥🔥🔥 إرجاع القيم الأصلية بعد التنفيذ 🔥🔥🔥
                                p.atk = originalAtk;

                                if (res && res.error) {
                                    await selection.editReply({ content: res.error, components: [] }).catch(()=>{});
                                    processingUsers.delete(i.user.id); return;
                                }
                                
                                if (res && res.name) skillNameUsed = res.name;
                                else if (skillObj.name !== 'Skill') skillNameUsed = skillObj.name;

                                actedPlayers.push(p.id); 
                                p.skipCount = 0; 
                                await selection.editReply({ content: `✅ تم استخـدام: ${skillNameUsed}`, components: [] }).catch(()=>{});
                                
                                await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] }).catch(()=>{});

                                // 🔥 فحص الموت الجماعي بعد المهارة (مثل Sacrifice) 🔥
                                checkDeaths(players, floor, log, threadChannel);
                                if (players.every(p => p.isDead)) {
                                    ongoing = false;
                                    collector.stop('all_dead');
                                    return;
                                }

                                if (monster.hp <= 0) {
                                    monster.hp = 0;
                                    ongoing = false;
                                    collector.stop('monster_dead');
                                    return;
                                }

                            } catch (err) { 
                                processingUsers.delete(i.user.id); return; 
                            }
                        } 
                        else if (i.customId === 'heal') {
                            const potionRow = buildPotionSelector(p, sql, guild.id);
                            if (!potionRow) {
                                await i.followUp({ content: "❌ لا تملك جرعات في حقيبتك!", ephemeral: true });
                                processingUsers.delete(i.user.id); return;
                            }
                            try {
                                const potionMsg = await i.followUp({ content: "🧪 **اختر الجرعة:**", components: [potionRow], ephemeral: true });
                                const selection = await potionMsg.awaitMessageComponent({ filter: subI => subI.user.id === i.user.id, time: 15000 });
                                await selection.deferUpdate().catch(()=>{});
                                const potionId = selection.values[0].replace('use_potion_', '');
                                
                                if (sql.open) {
                                    sql.prepare("UPDATE user_inventory SET quantity = quantity - 1 WHERE userID = ? AND guildID = ? AND itemID = ?").run(p.id, guild.id, potionId);
                                }

                                let actionMsg = "";
                                if (potionId === 'potion_heal') {
                                    p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.5));
                                    actionMsg = "🧪 استعاد 50% HP!";
                                } else if (potionId === 'potion_reflect') {
                                    p.effects.push({ type: 'reflect', val: 0.5, turns: 2 });
                                    actionMsg = "🌵 جهز درع الأشواك!";
                                } else if (potionId === 'potion_time') {
                                    p.special_cooldown = 0;
                                    p.skillCooldowns = {};
                                    actionMsg = "⏳ شرب جرعة الزمن وأعاد شحن مهاراته!";
                                } else if (potionId === 'potion_titan') {
                                    p.maxHp *= 2; p.hp = p.maxHp;
                                    p.effects.push({ type: 'titan', turns: 3 }); 
                                    monster.targetFocusId = p.id;
                                    actionMsg = "🔥 تحول لعملاق!";
                                } else if (potionId === 'potion_sacrifice') {
                                    p.hp = 0; p.isDead = true; p.isPermDead = true;
                                    p.deathFloor = floor; 
                                    players.forEach(ally => {
                                        if (ally.id !== p.id) {
                                            ally.isDead = false;
                                            ally.isPermDead = false;
                                            ally.reviveCount = 0;
                                            ally.hp = ally.maxHp; 
                                            ally.effects = [];
                                        }
                                    });
                                    actionMsg = "💀 شرب جرعة التضحية، تحللت جثته وأنقذ الجميع!";
                                    threadChannel.send(`💀 **${p.name}** شرب جرعة التضحية، تحللت جثته وأنقذ الفريق!`).catch(()=>{});
                                }
                                log.push(`**${p.name}**: ${actionMsg}`);
                                actedPlayers.push(p.id); 
                                p.skipCount = 0; 
                                await selection.editReply({ content: `✅ ${actionMsg}`, components: [] }).catch(()=>{});
                                
                                await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] }).catch(()=>{});

                                // 🔥 فحص الموت الجماعي بعد الجرعة 🔥
                                checkDeaths(players, floor, log, threadChannel);
                                if (players.every(p => p.isDead)) {
                                    ongoing = false;
                                    collector.stop('all_dead');
                                    return;
                                }

                                if (monster.hp <= 0) {
                                    monster.hp = 0;
                                    ongoing = false;
                                    collector.stop('monster_dead');
                                    return;
                                }

                            } catch (err) { processingUsers.delete(i.user.id); return; }
                        }
                        else if (i.customId === 'atk' || i.customId === 'def') {
                            actedPlayers.push(p.id); 
                            p.skipCount = 0; 
                            if (i.customId === 'atk') {
                                let canAttack = true;
                                const confusion = p.effects.find(e => e.type === 'confusion');
                                if (confusion && Math.random() < confusion.val) {
                                    canAttack = false;
                                    const selfDmg = Math.floor(p.maxHp * 0.15); 
                                    applyDamageToPlayer(p, selfDmg);
                                    log.push(`😵 **${p.name}** في حالة ارتباك وضرب نفسه! (-${selfDmg})`);
                                } 
                                else if (p.effects.some(e => e.type === 'blind' && Math.random() < e.val)) {
                                    canAttack = false;
                                    log.push(`☁️ **${p.name}** هاجم ولكن أخطأ الهدف بسبب العمى!`);
                                }

                                if (canAttack) {
                                    let atkMultiplier = 1.0;
                                    p.effects.forEach(e => { if(e.type === 'atk_buff') atkMultiplier += e.val; });
                                    let currentAtk = Math.floor(p.atk * atkMultiplier);
                                    
                                    // 1. تطبيق الختم للمختومين
                                    if (p.isSealed) {
                                        currentAtk = Math.floor(currentAtk * p.sealMultiplier); 
                                    }

                                    const baseCrit = p.critRate || 0.2;
                                    const isCrit = Math.random() < baseCrit;
                                    
                                    let dmg = Math.floor(currentAtk * (0.9 + Math.random() * 0.2));
                                    if (isCrit) dmg = Math.floor(dmg * 1.5);

                                    // 2. تطبيق سقف الدمج الصارم (Hard Caps) للجميع
                                    if (floor <= 5) {
                                        if (dmg > 47) dmg = 47;
                                    } else if (floor <= 10) {
                                        if (dmg > 88) dmg = 88;
                                    } else if (floor <= 14) {
                                        if (dmg > 120) dmg = 120;
                                    }

                                    monster.hp -= dmg; p.totalDamage += dmg; 
                                    log.push(`🗡️ **${p.name}** ${isCrit ? '**CRIT!**' : ''} سبب ${dmg} ضرر.`);
                                }
                            } else if (i.customId === 'def') {
                                p.defending = true; log.push(`🛡️ **${p.name}** يدافع!`);
                            }
                            
                            await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] }).catch(()=>{});

                            checkDeaths(players, floor, log, threadChannel); // 🔥 فحص الموت
                            if (players.every(p => p.isDead)) {
                                ongoing = false;
                                collector.stop('all_dead');
                                return;
                            }

                            if (monster.hp <= 0) {
                                monster.hp = 0;
                                ongoing = false;
                                collector.stop('monster_dead');
                                return; 
                            }
                        }

                        if (actedPlayers.length >= players.filter(pl => !pl.isDead).length) { 
                            clearTimeout(turnTimeout); collector.stop('turn_end'); 
                        }
                    } catch (error) { console.error(error); } finally { processingUsers.delete(i.user.id); }
                });

                collector.on('end', () => { clearTimeout(turnTimeout); resolve(); });
            });

            if (monster.hp <= 0) { ongoing = false; await battleMsg.edit({ components: [] }).catch(()=>{}); }

            // تحديث التهدئة
            players.forEach(p => { 
                for (const sid in p.skillCooldowns) if (p.skillCooldowns[sid] > 0) p.skillCooldowns[sid]--; 
                if (p.special_cooldown > 0) p.special_cooldown--; 
                p.effects = p.effects.filter(e => { e.turns--; return e.turns > 0; });
            });

            if (turnCount % 3 === 0 && ongoing) {
                try {
                    await battleMsg.delete();
                    battleMsg = await threadChannel.send({ 
                        embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])], 
                        components: generateBattleRows() 
                    });
                } catch(e) {
                    console.log("Battle message deleted or thread gone.");
                    break;
                }
            }

            if (monster.hp > 0 && ongoing) {
                turnCount++;
                if (monster.frozen) { log.push(`❄️ **${monster.name}** متجمد!`); monster.frozen = false; } 
                else {
                    if (monster.effects) {
                        monster.effects = monster.effects.filter(e => {
                            if (e.type === 'burn') {
                                const burnDmg = e.val;
                                monster.hp -= burnDmg;
                                log.push(`🔥 **${monster.name}** يحترق! (-${burnDmg} HP)`);
                            }
                            if (e.type === 'poison') {
                                const poisonDmg = e.val;
                                monster.hp -= poisonDmg;
                                log.push(`☠️ **${monster.name}** يتألم من السم! (-${poisonDmg} HP)`);
                            }
                            e.turns--;
                            return e.turns > 0;
                        });
                    }

                    // 🔥 تحديث فوري إذا مات الوحش من السم 🔥
                    if (monster.hp <= 0) {
                         monster.hp = 0;
                         ongoing = false;
                         await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])], components: [] }).catch(()=>{});
                         break; 
                    }

                    const confusion = monster.effects.find(e => e.type === 'confusion');
                    if (confusion && Math.random() < confusion.val) {
                        const selfDmg = Math.floor(monster.atk * 0.5);
                        monster.hp -= selfDmg;
                        log.push(`😵 **${monster.name}** في حالة ارتباك وضرب نفسه! (-${selfDmg} HP)`);
                    } else {
                        const alive = players.filter(p => !p.isDead);
                        let skillUsed = false;

                        if (alive.length > 0) {
                            const baseMonsterName = monster.name.split(' (Lv.')[0].trim();
                            const monsterSkill = MONSTER_SKILLS[baseMonsterName];

                            if (monsterSkill) {
                                let chance = monsterSkill.chance;
                                if (monster.hp < monster.maxHp * 0.3) chance += 0.2; 
                                if (Math.random() < chance) {
                                    monsterSkill.execute(monster, players, log);
                                    skillUsed = true;
                                }
                            }
                        }

                        if (!skillUsed && alive.length > 0) {
                            if (Math.random() < 0.20) {
                                const randomGenericSkill = GENERIC_MONSTER_SKILLS[Math.floor(Math.random() * GENERIC_MONSTER_SKILLS.length)];
                                randomGenericSkill.execute(monster, players, log);
                                skillUsed = true;
                            }
                        }

                        if (!skillUsed && alive.length > 0) {
                            players.forEach(p => {
                                if (!p.isDead && p.summon && p.summon.active && p.summon.turns > 0) {
                                    const petDmg = Math.floor(p.atk * 0.5);
                                    monster.hp -= petDmg;
                                    p.totalDamage += petDmg;
                                    log.push(`🐺 حارس **${p.name}** نهش الوحش! (${petDmg} ضرر)`);
                                    p.summon.turns--;
                                    if (p.summon.turns <= 0) {
                                        p.summon.active = false;
                                        log.push(`🐺 اختفى حارس **${p.name}**.`);
                                    }
                                }
                            });

                            if (monster.hp <= 0) { ongoing = false; break; }

                            let target = alive.find(p => p.id === monster.targetFocusId) || 
                                         alive.find(p => p.effects.some(e => e.type === 'titan')) ||
                                         getSmartTarget(players) || 
                                         alive[Math.floor(Math.random() * alive.length)];
                            
                            if (target) {
                                let dmg = Math.floor(monster.atk * (1 + turnCount * 0.05));
                                if (monster.effects.some(e => e.type === 'weakness')) dmg = Math.floor(dmg * 0.75);
                                if(target.defending) dmg = Math.floor(dmg * 0.5);
                                
                                const reflectEffect = target.effects.find(e => e.type === 'reflect');
                                if (reflectEffect) {
                                    const reflected = Math.floor(dmg * reflectEffect.val);
                                    dmg -= reflected;
                                    monster.hp -= reflected;
                                    log.push(`🔄 **${target.name}** عكس **${reflected}** ضرر للوحش!`);
                                }

                                const takenDmg = applyDamageToPlayer(target, dmg);
                                if (takenDmg === 0 && dmg > 0) log.push(`👻 **${target.name}** راوغ الهجوم!`);
                                else log.push(`👹 **${monster.name}** ضرب **${target.name}** (${takenDmg})`);
                                
                                // 🔥 فحص الموت الشامل بعد هجوم الوحش 🔥
                                checkDeaths(players, floor, log, threadChannel);
                            }
                        }
                    }
                }
                
                if (players.every(p => p.isDead)) ongoing = false;
                else {
                    if (log.length > 5) log = log.slice(-5);
                    await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])] }).catch(()=>{});
                }
            }
        }

        if (players.every(p => p.isDead)) {
            const finalFloor = isTrapActive ? trapStartFloor : floor;
            await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, finalFloor, "lose", sql, guild.id, hostId, activeDungeonRequests);
            break;
        }
        
        if (isTrapActive) {
            isTrapActive = false;
        }

        let baseMora = Math.floor(getBaseFloorMora(floor));
        let floorXp = Math.floor(baseMora * 0.03);  
        players.forEach(p => { if (!p.isDead) { p.loot.mora += baseMora; p.loot.xp += floorXp; } });
        totalAccumulatedCoins += baseMora;
        totalAccumulatedXP += floorXp;

        // ==========================================
        // ❖ تعديل منطقة الاستراحة (Floor Rest) ❖
        // ==========================================
        
        // 1. تحديد الطوابق الخاصة التي يسمح فيها بالانسحاب (33 تحولت لـ 38)
        const specificRetreatFloors = [38, 50, 80];
        
        // 2. التحقق مما إذا كان الانسحاب مسموحاً:
        const canRetreat = floor <= 20 || specificRetreatFloors.includes(floor);

        let restDesc = `✶ نجحتـم في تصفية الطابق الـ: **${floor}**\n✶ تم استعادة صحة المغامرين بنسبة **%30**\n\n**✶ الغنـائـم المتراكمة:**\n✬ Mora: **${totalAccumulatedCoins.toLocaleString()}** ${EMOJI_MORA}\n✬ XP: **${totalAccumulatedXP.toLocaleString()}** ${EMOJI_XP}`;

        const restRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('continue').setLabel('الاستمرار').setStyle(ButtonStyle.Success)
        );

        if (floor === 20) {
             // تنبيه خاص للطابق 20
             restDesc += `\n\n✥ **تحذيـر:** التوغل اكثر بالدانجون محفوف بالمخاطر الاستمرار الان سيمنعكم من الانسحـاب في معظم الطوابق`;
        } else if (floor > 20) {
             restDesc += `\n\n✥ **تحذيـر:** المنطقة خطرة - الانسحاب غير متاح في أغلب الطوابق!`;
        } else {
             restDesc += `\n\n- القرار بيد **القائد** للاستمرار أو الانسحاب!`;
        }

        // إضافة زر الانسحاب فقط إذا كان الشرط متحققاً
        if (canRetreat) {
             restRow.addComponents(
                new ButtonBuilder().setCustomId('retreat').setLabel('انسـحـاب').setStyle(ButtonStyle.Danger)
             );
        }

        const restEmbed = new EmbedBuilder()
            .setTitle('❖ استـراحـة بيـن الطـوابـق')
            .setDescription(restDesc)
            .setColor(Colors.Red)
            .setImage('https://i.postimg.cc/KcJ6gtzV/22.jpg');

        let restMsg;
        try {
            restMsg = await threadChannel.send({ embeds: [restEmbed], components: [restRow] });
        } catch (err) {
            console.log("Thread likely deleted during rest.");
            break;
        }

        // 🔥 مؤقت التنبيه قبل النهاية بـ 10 ثواني 🔥
        const warningTimeout = setTimeout(() => {
            threadChannel.send("✶ الدانجـون سيبتلـعـكم بسبب الخمـول امام القائد 10 ثواني للاستمرار").catch(()=>{});
        }, 50000); // 50 ثانية
        
        const decision = await new Promise(res => {
            const decCollector = restMsg.createMessageComponentCollector({ time: 60000 });
            decCollector.on('collect', async i => {
                clearTimeout(warningTimeout); // إيقاف التنبيه عند التفاعل

                if (i.customId === 'continue') {
                    if (i.user.id !== hostId) {
                        return i.reply({ content: "🚫 **فقط القائد يمكنه اختيار الاستمرار!**", ephemeral: true });
                    }
                    await i.deferUpdate(); 
                    return decCollector.stop('continue');
                }

                if (i.customId === 'retreat' && canRetreat) {
                    if (i.user.id === hostId) {
                        await i.deferUpdate();
                        return decCollector.stop('retreat');
                    } else {
                        const pIndex = players.findIndex(p => p.id === i.user.id);
                        if (pIndex > -1) {
                            const leavingPlayer = players[pIndex];
                            leavingPlayer.retreatFloor = floor;
                            retreatedPlayers.push(leavingPlayer);
                            players.splice(pIndex, 1); 
                            
                            await i.reply({ content: `👋 **لقد انسحبت من الدانجون واكتفيت بغنائمك!**`, ephemeral: true });
                            await threadChannel.send(`💨 **${leavingPlayer.name}** قـرر الانسحاب والاكتفاء بما حصد من غنائم!`).catch(()=>{});
                            
                            if (players.length === 0) decCollector.stop('retreat');
                        } else {
                            await i.reply({ content: "أنت لست في قائمة المشاركين النشطين.", ephemeral: true });
                        }
                    }
                }
            });
            
            decCollector.on('end', (c, reason) => {
                clearTimeout(warningTimeout); // التأكد من إيقاف المؤقت
                res(reason);
            });
        });

        await restMsg.edit({ components: [] }).catch(()=>{});

        if (decision === 'time') { 
            // 🔥🔥 موت الفريق بالكامل عند انتهاء الوقت 🔥🔥
            players.forEach(p => { p.isDead = true; p.hp = 0; });
            await threadChannel.send(`☠️ **انتهى الوقت!** ابتلع الدانجون الفريق بأكمله بسبب تردد القائد...`).catch(()=>{});
            await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, floor, "lose", sql, guild.id, hostId, activeDungeonRequests);
            break; // إنهاء الدانجون
        } 
        else if (decision === 'retreat') {
            await sendEndMessage(mainChannel, threadChannel, players, retreatedPlayers, floor, "retreat", sql, guild.id, hostId, activeDungeonRequests);
            return;
        } 
        else if (decision === 'continue') {
            
            // فخ الشذوذ الزمكاني (بدون منشن)
            if (floor > 10 && floor < 90 && Math.random() < 0.01) { 
                isTrapActive = true;
                trapStartFloor = floor;
                
                const minTarget = floor + 2;
                const maxTarget = 95;
                const targetFloor = Math.floor(Math.random() * (maxTarget - minTarget + 1)) + minTarget;
                floor = targetFloor - 1; 

                const trapEmbed = new EmbedBuilder()
                    .setTitle('⚠️ انـذار: شـذوذ زمـكـانـي!')
                    .setDescription(`🌀 **لقد وقعتم في فخ الأبعاد!**\nتم قذفكم قسراً للأمام إلى الطابق **${targetFloor}**!\n\n☠️ الوحوش هنا لا ترحم... النجاة شبه مستحيلة!`)
                    .setColor(Colors.DarkRed)
                    .setThumbnail('https://media.discordapp.net/attachments/1145327691772481577/115000000000000000/blackhole.gif'); 

                await threadChannel.send({ embeds: [trapEmbed] }).catch(()=>{});
            } else {
                
                // رسالة التوغل
                await threadChannel.send(`⚔️ **يتوغل الفريق بالدانجون نحو طوابق أعمق...**`).catch(()=>{});

                // 🔥🔥 نقل القيادة للأقوى إذا مات القائد (تحديث جديد) 🔥🔥
                const currentHost = players.find(p => p.id === hostId);
                if (currentHost && currentHost.isDead) {
                    const livingCandidates = players.filter(p => !p.isDead);
                    if (livingCandidates.length > 0) {
                        livingCandidates.sort((a, b) => b.totalDamage - a.totalDamage);
                        const newHost = livingCandidates[0];
                        hostId = newHost.id; // تحديث القائد للمرحلة القادمة
                        
                        await threadChannel.send(`👑 **سقط القائد في المعركة!**\nانتقلت القيادة تلقائياً إلى صاحب أعلى ضرر: <@${newHost.id}>`).catch(()=>{});
                    }
                }

                // نظام الأحداث
                const canTriggerEvent = (floor - lastEventFloor) > 4;

                if (canTriggerEvent && floor > 5 && !isTrapActive && Math.random() < 0.30) {
                    
                    let eventToTrigger = '';

                    if (lastEventType === 'merchant') {
                        eventToTrigger = 'chest'; 
                    } else if (lastEventType === 'chest') {
                        eventToTrigger = 'merchant'; 
                    } else {
                        eventToTrigger = Math.random() < 0.5 ? 'merchant' : 'chest';
                    }

                    if (eventToTrigger === 'merchant') {
                        await triggerMysteryMerchant(threadChannel, players, sql, guild.id, merchantState);
                        lastEventType = 'merchant';
                        lastEventFloor = floor;
                        await new Promise(r => setTimeout(r, 46000));
                    } else {
                        await triggerMimicChest(threadChannel, players);
                        lastEventType = 'chest';
                        lastEventFloor = floor;
                        await new Promise(r => setTimeout(r, 62000));
                    }
                }
            }
        }

        players.forEach(p => { if(!p.isDead) p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.3)); });
    }
}

async function sendEndMessage(mainChannel, thread, activePlayers, retreatedPlayers, floor, status, sql, guildId, hostId, activeDungeonRequests) {
    if (!sql || !sql.open) return;
    let title = "", color = "", randomImage = null;

    if (status === 'win') { title = "❖ أسطـورة الدانـجون !"; color = "#00FF00"; randomImage = getRandomImage(WIN_IMAGES); } 
    else if (status === 'retreat') { title = "❖ انـسـحـاب تـكـتيـكـي !"; color = "#FFFF00"; randomImage = getRandomImage(WIN_IMAGES); } 
    else { title = "❖ هزيمـة ساحقـة ..."; color = "#FF0000"; randomImage = getRandomImage(LOSE_IMAGES); }

    const allParticipants = [...activePlayers, ...retreatedPlayers];
    
    let mvpPlayer = allParticipants.length > 0 ? allParticipants.reduce((p, c) => (p.totalDamage > c.totalDamage) ? p : c) : null;
    
    let lootString = "";
    allParticipants.forEach(p => {
        let finalMora = 0;
        let finalXp = 0;

        if (status === 'lose' && floor > 20) {
            finalMora = 1000;
            finalXp = 100;
        } else {
            finalMora = Math.floor(p.loot.mora);
            finalXp = Math.floor(p.loot.xp);
            
            if (p.isDead) { 
                finalMora = Math.floor(finalMora * 0.5); 
                finalXp = Math.floor(finalXp * 0.5); 
            }
        }
        
        let statusEmoji = "";
        if (p.isDead) { 
            const deathFloorInfo = p.deathFloor ? `(مات في ${p.deathFloor})` : "(مات)";
            statusEmoji = `💀 ${deathFloorInfo}`;
        } else if (p.retreatFloor) {
            statusEmoji = `🏃‍♂️ (انسحب في ${p.retreatFloor})`;
        } else {
            statusEmoji = "✅ (صمد للنهاية)";
        }

        sql.prepare("UPDATE levels SET xp = xp + ?, mora = mora + ? WHERE user = ? AND guild = ?").run(finalXp, finalMora, p.id, guildId);
        lootString += `✬ <@${p.id}> ${statusEmoji}: ${finalMora} ${EMOJI_MORA} | ${finalXp} XP\n`;
    });

    let description = `**الطابق:** ${floor}\n\n**✶ تقـريـر المعـركـة:**\nنجم المعركة: ${mvpPlayer ? `<@${mvpPlayer.id}>` : 'N/A'}\n\n${lootString}`;

    if (floor >= 10 && mvpPlayer) {
        description += `\n\n**✨ جائـزة نجـم المعركـة:**\n<@${mvpPlayer.id}> (ضرر: ${mvpPlayer.totalDamage.toLocaleString()})\nحصل على تعزيز **15%** مورا واكس بي لـ **15د** ${EMOJI_BUFF}`;
    }

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color).setImage(randomImage).setTimestamp();

    await mainChannel.send({ content: allParticipants.map(p => `<@${p.id}>`).join(' '), embeds: [embed] }).catch(()=>{});
    activeDungeonRequests.delete(hostId);
    
    if (floor >= 10) {
        if (status === 'lose') {
            const debuffDuration = 15 * 60 * 1000;
            const expiresAt = Date.now() + debuffDuration;
            
            allParticipants.forEach(p => {
                sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, p.id, -15, expiresAt, 'mora', -0.15);
                sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, p.id, -15, expiresAt, 'xp', -0.15);
            });
            await mainChannel.send(`**💀 لعنـة الهزيمـة:** أصابت اللعنة جميع المشاركين! (-15% مورا واكس بي لـ 15د) ${EMOJI_NERF}`).catch(()=>{});

        } else if (mvpPlayer) {
            const buffDuration = 15 * 60 * 1000; 
            const expiresAt = Date.now() + buffDuration;
            
            sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, mvpPlayer.id, 15, expiresAt, 'mora', 0.15);
            sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, mvpPlayer.id, 15, expiresAt, 'xp', 0.15);
        }
    }

    try {
        await thread.send({ content: `**✶ انتهت الرحلة، سيتم إغلاق البوابة غـادروا بسرعة <:emoji_69:1451172248173023263> ...**` });
        setTimeout(() => { thread.delete().catch(()=>{}); }, 10000); 
    } catch(e) { }
}

module.exports = { runDungeon };
