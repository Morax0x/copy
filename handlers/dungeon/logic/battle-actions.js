// handlers/dungeon/logic/battle-actions.js

const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder 
} = require('discord.js');

const { 
    EMOJI_MORA, 
    OWNER_ID, 
    potionItems,
    ITEM_LIMITS 
} = require('../constants'); 

const { 
    applyDamageToPlayer, 
    getRealPlayerData,
    calculateThreat 
} = require('../utils');

const { 
    checkBossPhase 
} = require('../monsters');

const { handleSkillUsage } = require('../skills');

const { 
    buildSkillSelector, 
    buildPotionSelector, 
    generateBattleEmbed 
} = require('../ui');

const weaponCalculator = require('../../combat/weapon-calculator');
const { cleanName } = require('../core/battle-utils'); 
const { handleOwnerMenu } = require('../actions/owner-menu');
const { saveDungeonState } = require('../core/state-manager');

// ✅✅✅ التصحيح هنا: استخدام المسار الصحيح للملف المجاور ✅✅✅
const { getFloorCaps } = require('./seal-system'); 

/**
 * معالجة تفاعل اللاعب مع أزرار المعركة
 */
async function handlePlayerBattleInteraction(i, context) {
    const {
        players, monster, floor, theme, log, threadChannel, sql, guild, hostId,
        activeDungeonRequests, merchantState, retreatState, retreatedPlayers, isTrapActive,
        totalAccumulatedCoins, totalAccumulatedXP, battleMsg, turnTimeout, collector,
        ongoingRef, actedPlayers, processingUsers
    } = context;

    // 🔥 1. تحقق خاص للأونر في البداية
    const isOwnerDefend = (i.customId === 'def' && i.user.id === OWNER_ID);

    if (!isOwnerDefend) {
        if (!i.replied && !i.deferred && !i.isStringSelectMenu() && !i.isModalSubmit()) {
            try {
                await i.deferUpdate();
            } catch (e) {
                // تجاهل الخطأ
            }
        }
    }

    // 🔥 2. منع التكرار
    if (processingUsers.has(i.user.id)) {
        return; 
    }

    // 🔥 3. حساب حدود الطابق الحالي 🔥
    const { damageCap, levelCap } = getFloorCaps(floor);

    // 4. قائمة المالك
    if (isOwnerDefend) {
        try {
            await handleOwnerMenu(i, players, monster, log, threadChannel, sql, guild, hostId, activeDungeonRequests, merchantState, battleMsg, turnTimeout, collector, ongoingRef);
        } catch (err) {
            console.error("Owner Menu Error:", err);
            if (!i.replied && !i.deferred) {
                await i.reply({ content: `❌ حدث خطأ في قائمة المالك.`, ephemeral: true }).catch(()=>{});
            }
        }
        
        if (!ongoingRef.value) {
             if (!collector.ended) collector.stop('owner_action'); 
             return { ongoing: false };
        }
        return { ongoing: true };
    }

    // 5. دخول المالك للمعركة
    if (i.user.id === OWNER_ID && !players.find(p => p.id === OWNER_ID)) {
        const member = await i.guild.members.fetch(OWNER_ID).catch(() => null);
        if (member) {
             const ownerPlayer = getRealPlayerData(member, sql, '???'); 
             ownerPlayer.name = cleanName(ownerPlayer.name);
             players.push(ownerPlayer);
             log.push(`👑 **الأمبراطـور اقتحـم المعركـة!**`);
        }
    }
        
    let p = players.find(pl => pl.id === i.user.id);
    if (!p) {
        return i.followUp({ content: "🚫 لست مشاركاً!", ephemeral: true }).catch(()=>{});
    }
    
    if (p.isDead || actedPlayers.includes(p.id)) return { ongoing: true };

    // التحقق من الشلل
    if (p.effects.some(e => e.type === 'stun')) {
        await i.followUp({ content: "🚫 **أنت مشلول ولا تستطيع الحركة هذا الدور!**", ephemeral: true });
        actedPlayers.push(p.id); p.skipCount = 0; 
        log.push(`❄️ **${p.name}** مشلول ولم يستطع التحرك!`);
        
        await battleMsg.edit({ 
            content: '', 
            embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] 
        }).catch(()=>{});
        
        if (actedPlayers.length >= players.filter(pl => !pl.isDead).length) { 
            clearTimeout(turnTimeout); 
            collector.stop('turn_end'); 
        }
        return { ongoing: true };
    }
        
    processingUsers.add(i.user.id);

    try {
        // ========================
        // SKILLS HANDLING
        // ========================
        if (i.customId === 'skill') {
            const skillRow = buildSkillSelector(p);
            if (!skillRow) {
                await i.followUp({ content: "❌ لا توجد مهارات.", ephemeral: true });
                processingUsers.delete(i.user.id); return { ongoing: true };
            }
            try {
                const skillMsg = await i.followUp({ content: "✨ **اختر المهارة:**", components: [skillRow], ephemeral: true });
                const selection = await skillMsg.awaitMessageComponent({ filter: subI => subI.user.id === i.user.id, time: 10000 });
                await selection.deferUpdate().catch(()=>{}); 

                const skillId = selection.values[0];
                
                const shieldSkills = ['skill_shielding', 'race_human_skill'];
                if (shieldSkills.includes(skillId) && p.shield > 0) {
                    await selection.followUp({ content: `🛡️ **لديك درع نشط بالفعل!**`, ephemeral: true });
                    processingUsers.delete(i.user.id); return { ongoing: true }; 
                }

                let skillNameUsed = "مهارة";
                let skillObj = { id: skillId, name: 'Skill', effectValue: 0, level: 1 };
                
                if (!skillId.startsWith('class_') && skillId !== 'class_special_skill' && skillId !== 'skill_secret_owner' && skillId !== 'skill_owner_leave') {
                     if (p.skills[skillId]) {
                         skillObj = { ...p.skills[skillId] }; 
                         if (skillObj.level > levelCap) skillObj.level = levelCap; 
                     }
                }

                const monsterHpBefore = monster.hp;
                const res = handleSkillUsage(p, { ...skillObj, id: skillId }, monster, log, threadChannel, players);
                const dmgDealt = monsterHpBefore - monster.hp;

                // 🔥 تطبيق سقف الدمج 🔥
                if (dmgDealt > 0) {
                    let finalDmg = dmgDealt;
                    if (damageCap !== Infinity && finalDmg > damageCap) {
                        finalDmg = damageCap;
                        monster.hp = Math.max(0, monsterHpBefore - finalDmg);
                        if (log.length > 0) {
                            const lastLogIdx = log.length - 1;
                            log[lastLogIdx] = log[lastLogIdx] + ` (مختوم: ${finalDmg})`; 
                        }
                    }
                }

                if (res && res.error) {
                    await selection.editReply({ content: res.error, components: [] }).catch(()=>{});
                    processingUsers.delete(i.user.id); return { ongoing: true };
                }
                
                if (res && res.name) skillNameUsed = res.name;
                else if (skillObj.name !== 'Skill') skillNameUsed = skillObj.name;

                p.threat = (p.threat || 0) + 100;

                actedPlayers.push(p.id); p.skipCount = 0; 
                await selection.editReply({ content: `✅ تم استخـدام: ${skillNameUsed}`, components: [] }).catch(()=>{});
                
                await battleMsg.edit({ 
                    content: '', 
                    embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] 
                }).catch(()=>{});

                checkBossPhase(monster, log); 
                
                await handleImmediateDeaths(players, threadChannel, ongoingRef, collector, monster);
                if (!ongoingRef.value) return { ongoing: false };

            } catch (err) { processingUsers.delete(i.user.id); return { ongoing: true }; }
        } 
        // ========================
        // HEAL / POTIONS / SHOP
        // ========================
        else if (i.customId === 'heal') {
            const potionRow = buildPotionSelector(p, sql, guild.id);
            if (!potionRow) {
                await i.followUp({ content: "❌ لا تملك جرعات في حقيبتك!", ephemeral: true });
                processingUsers.delete(i.user.id); return { ongoing: true };
            }
            try {
                const potionMsg = await i.followUp({ content: "🧪 **اختر الجرعة:**", components: [potionRow], ephemeral: true });
                const selection = await potionMsg.awaitMessageComponent({ filter: subI => subI.user.id === i.user.id, time: 20000 }); 
                await selection.deferUpdate().catch(()=>{});
                
                const selectedValue = selection.values[0];

                // --- Shop Logic ---
                if (selectedValue === 'buy_potions_action') {
                    const userLevelData = sql.prepare("SELECT mora FROM levels WHERE user = ? AND guild = ?").get(p.id, guild.id);
                    const currentMora = userLevelData ? userLevelData.mora : 0;

                    const shopOptions = potionItems.map(pot => ({
                        label: `${pot.name} (${pot.price.toLocaleString()} مورا)`,
                        value: pot.id,
                        description: pot.description ? pot.description.substring(0, 50) : "جرعة مفيدة",
                        emoji: pot.emoji
                    }));

                    const shopRow = new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('shop_buy_select')
                            .setPlaceholder('اختر الجرعة للشراء...')
                            .addOptions(shopOptions)
                    );

                    const shopMsg = await selection.followUp({
                        content: `💰 **متجر الجرعات السريع**\nرصيدك الحالي: **${currentMora.toLocaleString()}** ${EMOJI_MORA}\nاختر الجرعة التي تريد شراءها:`,
                        components: [shopRow],
                        ephemeral: true
                    });

                    try {
                        const buyInteraction = await shopMsg.awaitMessageComponent({ time: 15000 });
                        await buyInteraction.deferUpdate();
                        
                        const itemID = buyInteraction.values[0];
                        const targetItem = potionItems.find(x => x.id === itemID);

                        if (currentMora < targetItem.price) {
                            await buyInteraction.followUp({ content: `❌ **لا تملك مورا كافية!** تحتاج ${targetItem.price} مورا.`, ephemeral: true });
                        } else {
                            sql.prepare("UPDATE levels SET mora = mora - ? WHERE user = ? AND guild = ?").run(targetItem.price, p.id, guild.id);
                            const existingItem = sql.prepare("SELECT * FROM user_inventory WHERE userID = ? AND guildID = ? AND itemID = ?").get(p.id, guild.id, targetItem.id);
                            if (existingItem) {
                                sql.prepare("UPDATE user_inventory SET quantity = quantity + 1 WHERE id = ?").run(existingItem.id);
                            } else {
                                sql.prepare("INSERT INTO user_inventory (guildID, userID, itemID, quantity) VALUES (?, ?, ?, 1)").run(guild.id, p.id, targetItem.id);
                            }

                            await buyInteraction.followUp({ content: `✅ **تم شراء ${targetItem.name}!**\nيمكنك الآن فتح قائمة الجرعات مرة أخرى لاستخدامها.`, ephemeral: true });
                        }
                    } catch (e) {
                        await shopMsg.edit({ content: "⏰ انتهى وقت الشراء.", components: [] }).catch(()=>{});
                    }

                    processingUsers.delete(i.user.id);
                    return { ongoing: true }; 
                }

                // --- Potion Usage Logic ---
                const potionId = selectedValue.replace('use_potion_', '');
                
                // 🔥 تطبيق حد الاستخدام لجرعة العملاق 🔥
                if (potionId === 'potion_titan') {
                    const limit = (ITEM_LIMITS && ITEM_LIMITS['titan_potion']) ? ITEM_LIMITS['titan_potion'] : 3;
                    
                    p.titanPotionUses = p.titanPotionUses || 0;
                    if (p.titanPotionUses >= limit) {
                        await selection.followUp({ content: `🚫 **لقد استهلكت الحد الأقصى (${limit}) من جرعة العملاق في هذا الدانجون!**`, ephemeral: true });
                        processingUsers.delete(i.user.id);
                        return { ongoing: true };
                    }
                    p.titanPotionUses++; 
                }
                
                if (sql.open) {
                    sql.prepare("UPDATE user_inventory SET quantity = quantity - 1 WHERE userID = ? AND guildID = ? AND itemID = ?").run(p.id, guild.id, potionId);
                }

                let actionMsg = "";
                if (potionId === 'potion_heal') {
                    p.hp = Math.min(p.maxHp, p.hp + Math.floor(p.maxHp * 0.5));
                    actionMsg = "🧪 استعاد 50% HP!";
                    const threatGen = Math.floor((p.maxHp * 0.5) / 2);
                    p.threat = (p.threat || 0) + threatGen;

                } else if (potionId === 'potion_reflect') {
                    p.effects.push({ type: 'rebound_active', val: 0.5, turns: 2 });
                    actionMsg = "🌵 جهز درع الأشواك!";
                
                } else if (potionId === 'potion_time') {
                    // ✅✅✅ الإصلاح: تصفير الكولداون بشكل صحيح ✅✅✅
                    p.special_cooldown = 0; 
                    p.skillCooldowns = {};
                    actionMsg = "⏳ شرب جرعة الزمن وأعاد شحن مهاراته!";
                
                } else if (potionId === 'potion_titan') {
                    p.maxHp *= 2; p.hp = p.maxHp;
                    p.effects.push({ type: 'titan', floors: 5 }); 
                    monster.targetFocusId = p.id;
                    const used = p.titanPotionUses || 1;
                    const limit = (ITEM_LIMITS && ITEM_LIMITS['titan_potion']) ? ITEM_LIMITS['titan_potion'] : 3;
                    actionMsg = `🔥 تحول لعملاق! (يستمر لـ 5 طوابق) (${used}/${limit})`;
                    p.threat = (p.threat || 0) + 1000;

                } else if (potionId === 'potion_sacrifice') {
                    p.hp = 0; p.isDead = true; p.isPermDead = true; p.deathFloor = floor; 
                    players.forEach(ally => {
                        if (ally.id !== p.id) {
                            ally.isDead = false; ally.isPermDead = false; ally.reviveCount = 0;
                            ally.hp = ally.maxHp; ally.effects = [];
                        }
                    });
                    actionMsg = "💀 شرب جرعة التضحية، تحللت جثته وأنقذ الجميع!";
                    threadChannel.send(`💀 **${p.name}** شرب جرعة التضحية، تحللت جثته وأنقذ الفريق!`).catch(()=>{});
                }
                
                log.push(`**${p.name}**: ${actionMsg}`);
                actedPlayers.push(p.id); p.skipCount = 0; 
                await selection.editReply({ content: `✅ ${actionMsg}`, components: [] }).catch(()=>{});
                
                await battleMsg.edit({ 
                    content: '', 
                    embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] 
                }).catch(()=>{});

                saveDungeonState(sql, threadChannel.id, guild.id, hostId, {
                    floor, players, merchantState, retreatedPlayers, isTrapActive,
                    retreatState, 
                    loot: { coins: totalAccumulatedCoins, xp: totalAccumulatedXP },
                    themeName: theme.name,
                    monsterData: monster
                });

                await handleImmediateDeaths(players, threadChannel, ongoingRef, collector, monster);
                if (!ongoingRef.value) return { ongoing: false };

            } catch (err) { processingUsers.delete(i.user.id); return { ongoing: true }; }
        } 
        // ========================
        // ATTACK / DEFEND
        // ========================
        else if (i.customId === 'atk' || i.customId === 'def') {
            actedPlayers.push(p.id); p.skipCount = 0; 
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
                    const isOwner = p.id === OWNER_ID;
                    const monsterHpBefore = monster.hp;

                    // 🔥 إنشاء نسخة مؤقتة من اللاعب لتطبيق حد مستوى السلاح (Level Cap) 🔥
                    const cappedPlayer = { ...p }; 
                    if (cappedPlayer.weaponLevel > levelCap) {
                        cappedPlayer.weaponLevel = levelCap; // تخفيض اللفل مؤقتاً للحساب
                    }

                    // الحساب باستخدام النسخة المقلدة
                    const result = weaponCalculator.executeWeaponAttack(cappedPlayer, monster, isOwner);
                    const dmgDealt = monsterHpBefore - monster.hp;

                    // 🔥 تطبيق سقف الدمج الثابت (Damage Cap) 🔥
                    if (dmgDealt > 0) {
                        let finalDmg = dmgDealt;

                        if (damageCap !== Infinity && finalDmg > damageCap) {
                            finalDmg = damageCap;
                            monster.hp = Math.max(0, monsterHpBefore - finalDmg);
                            
                            result.log = result.log.replace(result.damage.toString(), finalDmg.toString());
                            result.log += ` (مختوم)`;
                        }
                    }

                    log.push(result.log);
                    
                    const threatGen = calculateThreat(p, dmgDealt, false);
                    p.threat = (p.threat || 0) + threatGen;

                    checkBossPhase(monster, log);
                }
            } else if (i.customId === 'def') {
                p.defending = true; log.push(`🛡️ **${p.name}** يدافع!`);
                if (p.class === 'Tank') p.threat = (p.threat || 0) + 200;
            }
             
            await battleMsg.edit({ 
                content: '', 
                embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] 
            }).catch(()=>{});

            await handleImmediateDeaths(players, threadChannel, ongoingRef, collector, monster);
            if (!ongoingRef.value) return { ongoing: false };
        }

        if (actedPlayers.length >= players.filter(pl => !pl.isDead).length) { 
            clearTimeout(turnTimeout); collector.stop('turn_end'); 
        }
    } catch (error) { console.error(error); } finally { processingUsers.delete(i.user.id); }

    return { ongoing: true };
}

// دالة مساعدة داخلية للتعامل مع الوفيات الفورية
async function handleImmediateDeaths(players, threadChannel, ongoingRef, collector, monster) {
    const deadThisTurn = players.filter(pl => pl.hp <= 0 && !pl.isDead);
    
    if (deadThisTurn.length > 0) {
        for (const deadP of deadThisTurn) {
            deadP.isDead = true;

            // 🔥 التعديل الجديد: إعلان التحلل الفوري 🔥
            if (deadP.reviveCount && deadP.reviveCount >= 1) {
                deadP.isPermDead = true;
                await threadChannel.send(`☠️ **${deadP.name}** لفظ أنفاسه الأخيرة وتحللت جثته! (لا يمكن إنعاشه)`).catch(()=>{});
            } else {
                await threadChannel.send(`💀 **${deadP.name}** سقط في أرض المعركة!`).catch(()=>{});
            }

            if (deadP.class === 'Priest') {
                players.forEach(ally => {
                    if (!ally.isDead && ally.id !== deadP.id) {
                        const healAmt = Math.floor(ally.maxHp * 0.20);
                        ally.hp = Math.min(ally.maxHp, ally.hp + healAmt);
                    }
                });
                await threadChannel.send(`✨ **سـقـط الكـاهن وعـالج الفريـق عـلى الرمـق الاخيـر ✨**`).catch(()=>{});
            }
        }
    }
    
    if (players.every(p => p.isDead)) { 
        ongoingRef.value = false; 
        collector.stop('all_dead'); 
    }
    if (monster.hp <= 0) { 
        monster.hp = 0; 
        ongoingRef.value = false; 
        collector.stop('monster_dead'); 
    }
}

module.exports = { handlePlayerBattleInteraction };
