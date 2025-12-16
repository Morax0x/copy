const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType, ChannelType, Colors } = require('discord.js');
const path = require('path');

// --- تحميل الإعدادات ---
const rootDir = process.cwd();
const dungeonConfig = require(path.join(rootDir, 'json', 'dungeon-config.json'));
const weaponsConfig = require(path.join(rootDir, 'json', 'weapons-config.json'));
const skillsConfig = require(path.join(rootDir, 'json', 'skills-config.json'));

// --- ثوابت النظام ---
const EMOJI_MORA = '<:mora:1435647151349698621>'; 
const EMOJI_XP = '<a:levelup:1437805366048985290>'; 
const EMOJI_BUFF = '<a:buff:1438796257522094081>';
const EMOJI_NERF = '<a:Nerf:1438795685280612423>';

const BASE_HP = 100;
const HP_PER_LEVEL = 4;
const DUNGEON_COOLDOWN = 3 * 60 * 60 * 1000; 
const OWNER_ID = "1145327691772481577"; 

const activeDungeonRequests = new Set();

// --- صور النتائج ---
const WIN_IMAGES = [
    'https://i.postimg.cc/JhMrnyLd/download-1.gif',
    'https://i.postimg.cc/FHgv29L0/download.gif',
    'https://i.postimg.cc/9MzjRZNy/haru-midoriya.gif',
    'https://i.postimg.cc/4ygk8q3G/tumblr-nmao11Zm-Bx1r3rdh2o2-500-gif-500-281.gif',
    'https://i.postimg.cc/pL6NNpdC/Epic7-Epic-Seven-GIF-Epic7-Epic-Seven-Tensura-Discover-Share-GIFs.gif',
    'https://i.postimg.cc/05dLktNF/download-5.gif',
    'https://i.postimg.cc/sXRVMwhZ/download-2.gif'
];

const LOSE_IMAGES = [
    'https://i.postimg.cc/xd8msjxk/escapar-a-toda-velocidad.gif',
    'https://i.postimg.cc/1zb8JGVC/download.gif',
    'https://i.postimg.cc/rmSwjvkV/download-1.gif',
    'https://i.postimg.cc/8PyPZRqt/download.jpg'
];

// --- دوال مساعدة ---

// دالة حساب الجوائز الأساسية (مورا) بناءً على الطابق
function getBaseFloorMora(floor) {
    // تم تعديل الأرقام لتكون معقولة كبداية قبل الضرب في العوامل الأخرى
    const staticRewards = {
        1: 50, 2: 75, 3: 100, 4: 150, 5: 300,
        6: 400, 7: 600, 8: 800, 9: 1000, 10: 1200
    };

    if (floor <= 10) {
        return staticRewards[floor];
    } else {
        const extra = floor - 10;
        return 1200 + (extra * 250);
    }
}

// دالة تحديد قوة التعزيز (Buff) بناءً على الطابق
function getDungeonBuff(floor) {
    if (floor >= 15) return { percent: 20, minutes: 30 };
    if (floor >= 9) return { percent: 10, minutes: 10 };
    if (floor >= 5) return { percent: 5, minutes: 5 };
    return { percent: 0, minutes: 0 };
}

function cleanDisplayName(name) {
    if (!name) return "لاعب";
    let clean = name.replace(/<a?:.+?:\d+>/g, '');
    clean = clean.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\DFFF]|\uD83D[\uDC00-\DFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\DFFF]/g, '');
    clean = clean.replace(/^[\s\d\[\]|.,\-#]+/, '');
    clean = clean.replace(/[\s\d\[\]|.,\-#]+$/, '');
    return clean.trim() || "لاعب";
}

function buildHpBar(currentHp, maxHp, shield = 0) {
    currentHp = Math.max(0, currentHp);
    const percentage = (currentHp / maxHp) * 10;
    const filled = '█';
    const empty = '░';
    let bar = `[${filled.repeat(Math.max(0, Math.floor(percentage))) + empty.repeat(Math.max(0, 10 - Math.floor(percentage)))}] ${currentHp}/${maxHp}`;
    if (shield > 0) bar += ` 🛡️(${shield})`;
    return bar;
}

function getRealPlayerData(member, sql) {
    const guildID = member.guild.id;
    const userID = member.id;
    const userData = sql.prepare("SELECT level FROM levels WHERE user = ? AND guild = ?").get(userID, guildID);
    const level = userData ? userData.level : 1;
    const maxHp = BASE_HP + (level * HP_PER_LEVEL);

    let damage = 15;
    let weaponName = "قبضة اليد";
      
    const allRaceRoles = sql.prepare("SELECT roleID, raceName FROM race_roles WHERE guildID = ?").all(member.guild.id);
    const userRoleIDs = member.roles.cache.map(r => r.id);
    const userRace = allRaceRoles.find(r => userRoleIDs.includes(r.roleID));

    if (userRace) {
        const weaponConfig = weaponsConfig.find(w => w.race === userRace.raceName);
        if (weaponConfig) {
            const userWeapon = sql.prepare("SELECT * FROM user_weapons WHERE userID = ? AND guildID = ? AND raceName = ?").get(userID, guildID, userRace.raceName);
            if (userWeapon && userWeapon.weaponLevel > 0) {
                damage = weaponConfig.base_damage + (weaponConfig.damage_increment * (userWeapon.weaponLevel - 1));
                weaponName = `${weaponConfig.name} (Lv.${userWeapon.weaponLevel})`;
            }
        }
    }

    const skillsOutput = {};
    const userSkillsData = sql.prepare("SELECT * FROM user_skills WHERE userID = ? AND guildID = ?").all(member.id, member.guild.id);
      
    if (userSkillsData) {
        userSkillsData.forEach(userSkill => {
            const skillConfig = skillsConfig.find(s => s.id === userSkill.skillID);
            if (skillConfig && userSkill.skillLevel > 0) {
                const effectValue = skillConfig.base_value + (skillConfig.value_increment * (userSkill.skillLevel - 1));
                skillsOutput[skillConfig.id] = { ...skillConfig, currentLevel: userSkill.skillLevel, effectValue: effectValue };
            }
        });
    }

    if (userRace) {
        const raceSkillId = `race_${userRace.raceName.toLowerCase().replace(/\s+/g, '_')}_skill`;
        const raceSkillConfig = skillsConfig.find(s => s.id === raceSkillId);
        if (raceSkillConfig && !skillsOutput[raceSkillId]) {
            skillsOutput[raceSkillId] = { ...raceSkillConfig, currentLevel: 1, effectValue: raceSkillConfig.base_value };
        }
    }

    return {
        id: userID,
        name: cleanDisplayName(member.displayName),
        avatar: member.user.displayAvatarURL(),
        level: level,
        hp: maxHp,
        maxHp: maxHp,
        atk: damage,
        weaponName: weaponName,
        skills: skillsOutput,
        isDead: false,
        defending: false,
        potions: 3,
        skillCooldowns: {},
        shield: 0,
        tempAtkMultiplier: 1.0,
        effects: [],
        totalDamage: 0,
        skipCount: 0, 
        loot: { mora: 0, xp: 0 }
    };
}

function getRandomMonster(type, theme) {
    let pool = [];
    if (type === 'boss') pool = dungeonConfig.monsters.bosses;
    else if (type === 'guardian') pool = dungeonConfig.monsters.guardians;
    else if (type === 'elite') pool = dungeonConfig.monsters.elites;
    else pool = dungeonConfig.monsters.minions;
     
    if (!pool || pool.length === 0) pool = dungeonConfig.monsters.minions;

    const name = pool[Math.floor(Math.random() * pool.length)];
    return { name, emoji: theme.emoji };
}

function buildSkillSelector(player) {
    const userSkills = player.skills || {};
    const availableSkills = Object.values(userSkills).filter(s => s.currentLevel > 0 || s.id.startsWith('race_'));
      
    if (availableSkills.length === 0 && player.id !== OWNER_ID) return null;

    const options = availableSkills.map(skill => {
        const cooldown = player.skillCooldowns[skill.id] || 0;
        const description = (cooldown > 0 && player.id !== OWNER_ID) ? `🕓 كولداون: ${cooldown} جولات` : `⚡ ${skill.description}`;
        return new StringSelectMenuOptionBuilder()
            .setLabel(skill.name)
            .setValue(skill.id)
            .setDescription(description.substring(0, 100))
            .setEmoji(skill.emoji || '✨');
    });

    if (player.id === OWNER_ID) {
        options.push(
            new StringSelectMenuOptionBuilder()
                .setLabel('تركيز تام')
                .setValue('skill_secret_owner')
                .setDescription('ضربة دقيقة تستهدف نقاط الضعف.')
                .setEmoji('👁️')
        );
    }

    if (options.length === 0) return null;
    const slicedOptions = options.slice(0, 25);

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
        .setCustomId('skill_select_menu')
        .setPlaceholder('اختر مهارة لاستخدامها...')
        .addOptions(slicedOptions)
    );
}

// --- معالجة منطق المهارات (للاعبين) ---
function handleSkillUsage(player, skill, monster, log) {
    let skillDmg = 0;
    const mult = (player.id === OWNER_ID) ? 10 : 1;

    if (skill.id === 'skill_secret_owner') {
        skillDmg = 3000; 
        monster.hp -= skillDmg;
        player.totalDamage += skillDmg;
        log.push(`👁️ **${player.name}** رصد ثغرة ووجه ضربة قاتلة بـ **${skillDmg}** ضرر!`);
        return;
    }

    const value = skill.effectValue; 

    switch (skill.id) {
        case 'skill_rebound': {
             const reflectPercent = (value / 100) * mult;
             player.effects.push({ type: 'counter', val: reflectPercent, turns: 1 });
             log.push(`🔄 **${player.name}** اتخذ وضعية الارتداد العكسي! (سيتم عكس ${Math.floor(reflectPercent*100)}% من الهجوم القادم).`);
             break;
        }

        case 'skill_healing':
        case 'skill_cleanse': {
            let healAmount = Math.floor(player.maxHp * (value / 100)) * mult;
            if (skill.id === 'skill_cleanse') {
                player.effects = []; 
                log.push(`✨ **${player.name}** تطهر وشفى **${healAmount}** HP.`);
            } else {
                log.push(`❤️‍🩹 **${player.name}** استخدم ${skill.name} واستعاد **${healAmount}** HP.`);
            }
            player.hp = Math.min(player.maxHp, player.hp + healAmount);
            break;
        }

        case 'skill_shielding':
        case 'race_human_skill': {
             let shieldAmount = Math.floor(player.maxHp * (value / 100)) * mult;
             player.shield = shieldAmount; 
             log.push(`${skill.emoji} **${player.name}** فعل درعاً بقوة **${shieldAmount}**.`);
             if (skill.id === 'race_human_skill') {
                 player.effects.push({ type: 'atk_buff', val: 0.2, turns: 2 });
                 log.push(`⚔️ **${player.name}** زادت عزيمته (ATK UP)!`);
             }
             break;
        }

        case 'race_dwarf_skill': {
             skillDmg = Math.floor(player.atk * 1.5) * mult;
             monster.hp -= skillDmg;
             player.totalDamage += skillDmg;

             if (player.shield <= 0) {
                 let addedShield = Math.floor(player.maxHp * 0.15) * mult;
                 player.shield = addedShield;
                 log.push(`🛡️ **${player.name}** ضرب بترسه (${skillDmg}) واكتسب درعاً (${addedShield})!`);
             } else {
                 log.push(`🛡️ **${player.name}** ضرب بترسه (${skillDmg}) (لديك درع بالفعل).`);
             }
             break;
        }

        case 'skill_buffing': {
             player.effects.push({ type: 'atk_buff', val: (value / 100) * mult, turns: 3 });
             log.push(`💪 **${player.name}** رفع قوته الهجومية!`);
             break;
        }

        case 'skill_poison':
        case 'race_dark_elf_skill': {
             skillDmg = Math.floor(player.atk * 0.5) * mult; 
             monster.effects.push({ type: 'poison', val: Math.floor(player.atk * (value/100)) * mult, turns: 3 });
             monster.hp -= skillDmg;
             player.totalDamage += skillDmg; 
             log.push(`☠️ **${player.name}** سمم الوحش! (ضرر ${skillDmg}).`);
             break;
        }

        case 'skill_gamble': {
             const isSuccess = Math.random() < 0.5; 
             if (isSuccess) {
                 const bonusDmg = Math.floor(Math.random() * (250 - 80 + 1)) + 80;
                 skillDmg = (player.atk + bonusDmg) * mult; 
                 log.push(`🎲 **${player.name}** خاطر ونجح! سدد ضربة قوية بمقدار **${skillDmg}**!`);
             } else {
                 const selfDamage = Math.floor(Math.random() * (70 - 30 + 1)) + 30;
                 skillDmg = 0;
                 player.hp -= selfDamage;
                 log.push(`🎲 **${player.name}** خسر الرهان! وانفجرت النردات في وجهه مسببة **${selfDamage}** ضرر!`);
             }
             if (skillDmg > 0) {
                monster.hp -= skillDmg;
                player.totalDamage += skillDmg; 
             }
             break;
        }
        
        case 'race_dragon_skill': {
             skillDmg = (Math.floor(player.atk * 1.5) + value) * mult;
             monster.hp -= skillDmg;
             player.totalDamage += skillDmg; 
             log.push(`🔥 **${player.name}** أطلق ${skill.name} بـ **${skillDmg}** ضرر!`);
             break;
        }

        case 'race_seraphim_skill':
        case 'race_vampire_skill': {
             skillDmg = (Math.floor(player.atk * 1.2) + value) * mult;
             const lifesteal = Math.floor(skillDmg * (skill.id === 'race_vampire_skill' ? 0.6 : 0.4));
             monster.hp -= skillDmg;
             player.totalDamage += skillDmg; 
             player.hp = Math.min(player.maxHp, player.hp + lifesteal);
             log.push(`${skill.emoji} **${player.name}** امتص حياة الخصم! (**${skillDmg}** ضرر / **+${lifesteal}** HP).`);
             break;
        }

        case 'race_demon_skill': {
             const selfDmg = Math.floor(player.maxHp * 0.10); 
             skillDmg = (Math.floor(player.atk * 2.5) + value) * mult;
             player.hp -= selfDmg;
             monster.hp -= skillDmg;
             player.totalDamage += skillDmg; 
             log.push(`🩸 **${player.name}** ضحى بدمه (**-${selfDmg}**) ليسبب **${skillDmg}**!`);
             break;
        }

        case 'race_elf_skill': {
             const hit1 = Math.floor(player.atk * 0.9) * mult;
             const hit2 = Math.floor(player.atk * 0.9) * mult;
             skillDmg = hit1 + hit2;
             monster.hp -= skillDmg;
             player.totalDamage += skillDmg; 
             log.push(`🏹 **${player.name}** أطلق سهمين دقيقين! (**${skillDmg}**).`);
             break;
        }
        
        case 'skill_weaken': {
             skillDmg = Math.floor(player.atk * 0.5) * mult;
             monster.effects.push({ type: 'weakness', val: 0.25, turns: 2 }); 
             monster.hp -= skillDmg;
             player.totalDamage += skillDmg; 
             log.push(`📉 **${player.name}** أضعف الوحش وسبب **${skillDmg}** ضرر.`);
             break;
        }
        
        case 'race_ghoul_skill': {
             let missingHpPercent = 1 - (player.hp / player.maxHp);
             let rageMult = 1.5 + (missingHpPercent * 2.5);
             skillDmg = Math.floor(player.atk * rageMult) * mult;
             monster.hp -= skillDmg;
             player.totalDamage += skillDmg; 
             log.push(`🧟 **${player.name}** هاج بجنون (HP ${(player.hp/player.maxHp*100).toFixed(0)}%) وسبب **${skillDmg}** ضرر!`);
             break;
        }

        case 'race_spirit_skill': {
             skillDmg = Math.floor(player.atk * 1.8) * mult;
             monster.hp -= skillDmg;
             player.totalDamage += skillDmg; 
             player.effects.push({ type: 'evasion', val: 0.5, turns: 1 });
             log.push(`👻 **${player.name}** ضرب بطيفية (${skillDmg}) وأصبح مراوغاً!`);
             break;
        }
        
        case 'skill_dispel': {
            monster.effects = monster.effects.filter(e => e.type === 'poison'); 
            log.push(`💨 **${player.name}** بدد السحر!`);
            break;
        }

        case 'race_hybrid_skill': {
            skillDmg = Math.floor(player.atk * 1.2) * mult;
            monster.hp -= skillDmg;
            player.effects.push({ type: 'atk_buff', val: 0.2 * mult, turns: 2 });
            log.push(`🌀 **${player.name}** سرق قوة الخصم (+ATK) وسبب **${skillDmg}** ضرر!`);
            break;
        }

        default: {
            let multiplier = skill.stat_type === '%' ? (1 + (value/100)) : 1;
            skillDmg = Math.floor((player.atk * multiplier) + (skill.stat_type !== '%' ? value : 0)) * mult;
            monster.hp -= skillDmg;
            player.totalDamage += skillDmg; 
            log.push(`💥 **${player.name}** استخدم ${skill.name} بـ **${skillDmg}** ضرر!`);
            break;
        }
    }
}

async function startDungeon(interaction, sql) {
    const user = interaction.user;

    if (activeDungeonRequests.has(user.id)) {
        return interaction.reply({ content: "🚫 لديك طلب دانجون نشط بالفعل!", ephemeral: true });
    }

    const leaderData = sql.prepare("SELECT level FROM levels WHERE user = ? AND guild = ?").get(user.id, interaction.guild.id);
    if (!leaderData || leaderData.level < 10) {
        return interaction.reply({ content: "مـا زلـت رحالاً يا غـلام يجب ان تصل للمستوى 10", ephemeral: true });
    }

    activeDungeonRequests.add(user.id);

    if (user.id !== OWNER_ID) {
        const lastRun = sql.prepare("SELECT last_dungeon FROM levels WHERE user = ? AND guild = ?").get(user.id, interaction.guild.id);
        const lastDungeon = lastRun?.last_dungeon || 0;
        const now = Date.now();
        const expirationTime = lastDungeon + DUNGEON_COOLDOWN;

        if (now < expirationTime) {
            const finishTimeUnix = Math.floor(expirationTime / 1000);
            const cooldownEmbed = new EmbedBuilder()
                .setTitle('❖ استـراحـة مـحـارب ..')
                .setDescription(`✶ استـرح قليلاً ايـهـا المحـارب \n✶ يمكنـك غـزو الـدانجون مجدداً: \n<t:${finishTimeUnix}:R>`)
                .setColor("Random")
                .setThumbnail('https://i.postimg.cc/4xMWNV22/doun.png');

            activeDungeonRequests.delete(user.id); 
            
            const isSlash = !!interaction.isChatInputCommand;
            if (isSlash) return interaction.reply({ embeds: [cooldownEmbed], ephemeral: true });
            else return interaction.reply({ embeds: [cooldownEmbed], allowedMentions: { repliedUser: false } });
        }
    }

    const themes = Object.keys(dungeonConfig.themes);
    const buttons = themes.map(key => {
        const theme = dungeonConfig.themes[key];
        return new ButtonBuilder()
            .setCustomId(`dungeon_theme_${key}`)
            .setLabel(theme.name)
            .setEmoji(theme.emoji)
            .setStyle(ButtonStyle.Secondary);
    });

    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();
    if (buttons.length > 0) row1.addComponents(buttons.slice(0, 2));
    if (buttons.length > 2) row2.addComponents(buttons.slice(2, 4));

    const components = [row1];
    if (row2.components.length > 0) components.push(row2);

    const embed = new EmbedBuilder()
        .setTitle('⚔️ بوابة الدانجون')
        .setDescription(`اهـلا ايها المغامـر <@${user.id}>!\nاختر الدانجون الذي تريد غـزوه:`)
        .setColor('#2B2D31')
        .setImage('https://i.postimg.cc/NMkWVyLV/line.png');

    const msg = await interaction.reply({ embeds: [embed], components: components, fetchReply: true });

    const filter = i => i.user.id === user.id && i.customId.startsWith('dungeon_theme_');
    const collector = msg.createMessageComponentCollector({ filter, time: 30000, max: 1 });

    collector.on('collect', async i => {
        const themeKey = i.customId.replace('dungeon_theme_', '');
        const theme = dungeonConfig.themes[themeKey];
        await lobbyPhase(i, theme, sql); 
    });

    collector.on('end', (c, reason) => {
        if (reason === 'time') {
            activeDungeonRequests.delete(user.id); 
            if (msg.editable) msg.edit({ content: "⏰ انتهى وقت الاختيار.", components: [] }).catch(()=>{});
        }
    });
}

async function lobbyPhase(interaction, theme, sql) {
    const host = interaction.user;
    let party = [host.id];
      
    const updateEmbed = () => {
        const memberList = party.map((id, i) => `\`${i+1}.\` <@${id}> ${id === host.id ? '👑' : ''}`).join('\n');
        return new EmbedBuilder()
            .setTitle(`${theme.emoji} بوابة الدانجون: ${theme.name}`)
            .setDescription(`**القائد:** ${host}\n**مستوى الانضمام المطلوب:** 5 وما فوق\n**التكلفة:** 100 ${EMOJI_MORA}\n\n👥 **الفريق:**\n${memberList}`)
            .setColor('DarkRed')
            .setThumbnail(host.displayAvatarURL());
    };

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('join').setLabel('انضمام').setStyle(ButtonStyle.Success).setEmoji('➕'),
        new ButtonBuilder().setCustomId('start').setLabel('انطلاق').setStyle(ButtonStyle.Danger).setEmoji('⚔️')
    );

    await interaction.update({ content: null, embeds: [updateEmbed()], components: [row] });
    const msg = await interaction.message;
    const collector = msg.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async i => {
        if (i.customId === 'join') {
            if (party.includes(i.user.id)) return i.reply({ content: "⚠️ أنت منضم بالفعل.", ephemeral: true });
            if (party.length >= 5) return i.reply({ content: "🚫 الفريق ممتلئ.", ephemeral: true });
            
            if (i.user.id !== OWNER_ID) {
                const joinData = sql.prepare("SELECT dungeon_join_count, last_join_reset FROM levels WHERE user = ? AND guild = ?").get(i.user.id, i.guild.id);
                const now = Date.now();
                const resetTime = (joinData?.last_join_reset || 0);
                
                if (now - resetTime < DUNGEON_COOLDOWN) {
                    if ((joinData?.dungeon_join_count || 0) >= 3) {
                        const finishTimeUnix = Math.floor((resetTime + DUNGEON_COOLDOWN) / 1000);
                        const cooldownEmbed = new EmbedBuilder()
                            .setTitle('❖ استـراحـة مـحـارب ..')
                            .setDescription(`✶ لقد انضممت لـ 3 فرق بالفعل!\n✶ يمكنك الانضمام مجدداً: \n<t:${finishTimeUnix}:R>`)
                            .setColor("Random")
                            .setThumbnail('https://i.postimg.cc/4xMWNV22/doun.png');
                        return i.reply({ embeds: [cooldownEmbed], ephemeral: true });
                    }
                }
            }

            const joinerData = sql.prepare("SELECT level, mora FROM levels WHERE user = ? AND guild = ?").get(i.user.id, i.guild.id);
            if (!joinerData || joinerData.level < 5) return i.reply({ content: "🚫 مستواك أقل من 5.", ephemeral: true });
            if (joinerData.mora < 100) return i.reply({ content: `❌ ليس لديك 100 ${EMOJI_MORA}.`, ephemeral: true });
            
            party.push(i.user.id);
            await i.update({ embeds: [updateEmbed()] });
            if (party.length >= 5) collector.stop('start');

        } else if (i.customId === 'start') {
            if (i.user.id !== host.id) return i.reply({ content: "⛔ فقط القائد يمكنه البدء.", ephemeral: true });
            collector.stop('start');
        }
    });

    collector.on('end', async (c, reason) => {
        if (reason === 'start') {
            const now = Date.now();

            party.forEach(id => {
                sql.prepare("UPDATE levels SET mora = mora - 100 WHERE user = ? AND guild = ?").run(id, interaction.guild.id);
                
                if (id === host.id) {
                    if (id !== OWNER_ID) {
                        sql.prepare("UPDATE levels SET last_dungeon = ? WHERE user = ? AND guild = ?").run(now, id, interaction.guild.id);
                    }
                } else {
                    if (id !== OWNER_ID) {
                        const jData = sql.prepare("SELECT dungeon_join_count, last_join_reset FROM levels WHERE user = ? AND guild = ?").get(id, interaction.guild.id);
                        const lastReset = jData?.last_join_reset || 0;

                        if (now - lastReset > DUNGEON_COOLDOWN) {
                            sql.prepare("UPDATE levels SET last_join_reset = ?, dungeon_join_count = 1 WHERE user = ? AND guild = ?").run(now, id, interaction.guild.id);
                        } else {
                            sql.prepare("UPDATE levels SET dungeon_join_count = dungeon_join_count + 1 WHERE user = ? AND guild = ?").run(id, interaction.guild.id);
                        }
                    }
                }
            });

            try {
                const thread = await msg.channel.threads.create({
                    name: `⚔️ دانجون ${host.username}`,
                    autoArchiveDuration: 60,
                    type: ChannelType.PublicThread, 
                    reason: 'Start Dungeon Battle'
                });

                const allMentions = party.map(id => `<@${id}>`).join(' ');
                await thread.send({ content: `🔔 **بدأت المعركة!** ${allMentions}` });

                if (msg.editable) await msg.edit({ content: `✅ **انطلقت المعركة!** <#${thread.id}>`, components: [] });

                await runDungeon(thread, msg.channel, party, theme, sql, host.id);

            } catch (err) {
                console.error(err);
                activeDungeonRequests.delete(host.id); 
                interaction.channel.send("❌ حدث خطأ أثناء إنشاء الثريد.");
            }
        } else {
            activeDungeonRequests.delete(host.id); 
            if (msg.editable) msg.edit({ content: "❌ تم إلغاء الدانجون.", components: [], embeds: [] });
        }
    });
}

// ⚔️⚔️ تشغيل الدانجون (منطق القتال المعدل) ⚔️⚔️
async function runDungeon(threadChannel, mainChannel, partyIDs, theme, sql, hostId) {
    const guild = threadChannel.guild;
    let players = [];
    
    // جلب بيانات اللاعبين
    for (const id of partyIDs) {
        const m = await guild.members.fetch(id).catch(()=>null);
        if (m) players.push(getRealPlayerData(m, sql));
    }

    if (players.length === 0) {
        activeDungeonRequests.delete(hostId);
        return threadChannel.send("❌ خطأ في البيانات.");
    }

    // 🔥 1. تم فك القفل: الطوابق من 1 إلى 100 متاحة للجميع 🔥
    const maxFloors = 100; // ثابت للجميع
    const gateDifficultyMult = 1.0; // لا يوجد تأثير لبوابة التطوير حالياً

    let totalAccumulatedCoins = 0;
    let totalAccumulatedXP = 0;

    for (let floor = 1; floor <= maxFloors; floor++) {
        if (players.every(p => p.isDead)) break; 

        players.forEach(p => { if (!p.isDead) { p.shield = 0; p.effects = []; } });

        const floorConfig = dungeonConfig.floors.find(f => f.floor === floor) || dungeonConfig.floors[dungeonConfig.floors.length - 1];
        const randomMob = getRandomMonster(floorConfig.type, theme);

        // ✅✅ Smart Scaling Logic الجديد (تدريجي) ✅✅
        let hpPercent;
        // من الطابق 1 إلى 4: 10% فقط من صحة الفريق (سهل جداً)
        if (floor <= 4) {
            hpPercent = 0.10;
        } 
        // من الطابق 5 إلى 10: 20%
        else if (floor <= 10) {
            hpPercent = 0.20;
        } 
        // من الطابق 11 وما فوق
        else {
            // يبدأ من 35% عند الطابق 11 ويزيد 10% كل 10 طوابق
            const tiersAbove10 = Math.floor((floor - 11) / 10); 
            hpPercent = 0.35 + (tiersAbove10 * 0.10);
        }

        const totalPlayersHealth = players.reduce((sum, p) => sum + p.maxHp, 0);
        let finalHp = Math.floor(totalPlayersHealth * hpPercent) + (floor * 15); 

        // تطبيق مضاعفات (إذا كانت موجودة في الكونفق)
        finalHp = Math.floor(finalHp * (floorConfig.hp_mult || 1) * gateDifficultyMult);
        
        // ✅✅ تعديل قوة هجوم الوحش لتكون أضعف قليلاً في البداية ✅✅
        const avgPlayerHp = players.reduce((sum, p) => sum + p.maxHp, 0) / players.length;
        const hitsToKillPlayer = Math.max(4, 12 - ((floor - 1) * 0.4)); // زيادة عدد الضربات لقتل اللاعب في البداية
        let smartAtk = avgPlayerHp / hitsToKillPlayer;
        let finalAtk = Math.floor(smartAtk * (floorConfig.atk_mult || 1) * gateDifficultyMult);
        if (finalAtk < 5) finalAtk = 5 + floor;

        let monster = {
            name: `${randomMob.name} (Lv.${floor})`, 
            hp: finalHp,
            maxHp: finalHp,
            atk: finalAtk, 
            enraged: false,
            effects: [],
            targetFocusId: null 
        };

        let log = [`⚠️ **الطابق ${floor}/${maxFloors}**: ظهر **${monster.name}**! (HP: ${monster.maxHp.toLocaleString()} | DMG: ${monster.atk})`];
        let ongoing = true;
        let turnCount = 0;

        const battleMsg = await threadChannel.send({ 
            embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])], 
            components: [generateBattleRow()] 
        });

        while (ongoing) {
            const collector = battleMsg.createMessageComponentCollector({ time: 60000 });
            let actedPlayers = [];
            let processingUsers = new Set(); 

            await new Promise(resolve => {
                const turnTimeout = setTimeout(() => { 
                    const afkPlayers = players.filter(p => !p.isDead && !actedPlayers.includes(p.id));
                    if (afkPlayers.length > 0) {
                          afkPlayers.forEach(afkP => {
                                afkP.skipCount = (afkP.skipCount || 0) + 1;
                                if (afkP.skipCount >= 5) {
                                    afkP.hp = 0; 
                                    afkP.isDead = true;
                                    threadChannel.send(`💀 **${afkP.name}** تم استبعاده من الفريق بسبب كثرة التخطي!`).catch(()=>{});
                                } else {
                                    monster.targetFocusId = afkP.id;
                                    threadChannel.send(`⏩ **${afkP.name}** لم يهاجم! (تخطي: ${afkP.skipCount}/5) - الوحش يركز عليه!`).catch(()=>{});
                                }
                          });
                    }
                    collector.stop('turn_end'); 
                }, 45000); 

                collector.on('collect', async i => {
                    let p = players.find(pl => pl.id === i.user.id);

                    if (!p && i.user.id === OWNER_ID) {
                         const ownerData = getRealPlayerData(i.member, sql);
                         players.push(ownerData);
                         p = ownerData;
                         threadChannel.send(`👑 **${p.name}** اقتحم المعركة!`).catch(()=>{});
                    }

                    if (!p) return i.reply({ content: "🚫 لست مشاركاً!", ephemeral: true });
                    if (p.isDead || actedPlayers.includes(p.id)) {
                        if (!i.replied && !i.deferred) await i.reply({ content: "⏳ انتظر دورك.", ephemeral: true });
                        return;
                    }
                    if (processingUsers.has(i.user.id)) { await i.deferUpdate().catch(()=>{}); return; }
                    processingUsers.add(i.user.id);

                    try {
                        if (i.customId === 'skill') {
                            const skillRow = buildSkillSelector(p);
                            if (!skillRow) {
                                await i.reply({ content: "❌ لا توجد مهارات.", ephemeral: true });
                                processingUsers.delete(i.user.id); return;
                            }
                            try {
                                const skillMsg = await i.reply({ content: "✨ **اختر المهارة:**", components: [skillRow], ephemeral: true, fetchReply: true });
                                const selection = await skillMsg.awaitMessageComponent({ filter: subI => subI.user.id === i.user.id, time: 10000 });
                                const skillId = selection.values[0];
                                
                                const shieldSkills = ['skill_shielding', 'race_human_skill'];
                                if (shieldSkills.includes(skillId) && p.shield > 0) {
                                    await selection.reply({ content: `🛡️ **لديك درع نشط بالفعل!**\nلا يمكنك تفعيل درع جديد حتى ينكسر أو ينفد. الرجاء اختيار مهارة أخرى.`, ephemeral: true });
                                    processingUsers.delete(i.user.id); 
                                    return; 
                                }

                                await selection.deferUpdate().catch(()=>{}); 
                                actedPlayers.push(p.id);
                                const skill = (skillId === 'skill_secret_owner') ? { id: 'skill_secret_owner', name: 'تركيز تام' } : p.skills[skillId];
                                
                                if (skillId !== 'skill_secret_owner') {
                                    if (p.id !== OWNER_ID && (p.skillCooldowns[skillId] || 0) > 0) {
                                        await selection.editReply({ content: `⏳ كولداون.`, components: [] }).catch(()=>{});
                                        processingUsers.delete(i.user.id); actedPlayers.pop(); return;
                                    }
                                    if (p.id !== OWNER_ID) p.skillCooldowns[skillId] = 3;
                                }
                                
                                handleSkillUsage(p, skill, monster, log);
                                p.skipCount = 0; 
                                await selection.editReply({ content: `✅ تم استخدام ${skill.name}`, components: [] }).catch(()=>{});
                            } catch (err) { 
                                if (err.code !== 10062) await i.editReply({ content: "⏰ انتهى الوقت.", components: [] }).catch(()=>{}); 
                                processingUsers.delete(i.user.id); return; 
                            }
                        } else {
                            if (i.customId === 'heal') {
                                if (p.potions > 0) {
                                    await i.deferUpdate().catch(()=>{});
                                    p.hp = Math.min(p.hp + Math.floor(p.maxHp * 0.35), p.maxHp);
                                    p.potions--;
                                    log.push(`🧪 **${p.name}** تعالج.`);
                                    await i.followUp({ content: `🧪 (+HP) متبقي: ${p.potions}`, ephemeral: true }).catch(()=>{});
                                    actedPlayers.push(p.id);
                                    p.skipCount = 0;
                                } else {
                                    await i.reply({ content: "❌ لا تملك جرعات!", ephemeral: true });
                                    processingUsers.delete(i.user.id); return; 
                                }
                            } else {
                                await i.deferUpdate().catch(()=>{});
                                actedPlayers.push(p.id);
                                p.skipCount = 0;

                                if (i.customId === 'atk') {
                                    let atkMultiplier = 1.0;
                                    p.effects.forEach(e => { if(e.type === 'atk_buff') atkMultiplier += e.val; });
                                    const currentAtk = Math.floor(p.atk * atkMultiplier);
                                    const isCrit = Math.random() < 0.2;
                                    let dmg = Math.floor(currentAtk * (0.9 + Math.random() * 0.2));
                                    if (isCrit) dmg = Math.floor(dmg * 1.5);
                                    monster.hp -= dmg;
                                    p.totalDamage += dmg; 
                                    log.push(`🗡️ **${p.name}** ${isCrit ? '**CRIT!**' : ''} سبب ${dmg} ضرر.`);
                                } else if (i.customId === 'def') {
                                    p.defending = true;
                                    log.push(`🛡️ **${p.name}** يدافع!`);
                                }
                            }
                        }

                        if (monster.hp <= 0) {
                            monster.hp = 0;
                            if (log.length > 5) log = log.slice(-5);
                            await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] }).catch(e => {});
                            collector.stop('monster_dead'); 
                            return; 
                        }

                        if (log.length > 5) log = log.slice(-5);
                        await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, actedPlayers)] }).catch(e => {});

                        if (actedPlayers.length >= players.filter(pl => !pl.isDead).length) { 
                            clearTimeout(turnTimeout); collector.stop('turn_end'); 
                        }
                    } catch (error) { console.error(error); } finally { processingUsers.delete(i.user.id); }
                });

                collector.on('end', () => { clearTimeout(turnTimeout); resolve(); });
            });

            // End Turn Logic
            players.forEach(p => { 
                for (const sid in p.skillCooldowns) if (p.skillCooldowns[sid] > 0) p.skillCooldowns[sid]--; 
                p.effects = p.effects.filter(e => { e.turns--; return e.turns > 0; });
            });

            if (monster.effects.length > 0) {
                monster.effects = monster.effects.filter(e => {
                    if (e.type === 'poison') { monster.hp -= e.val; log.push(`☠️ **${monster.name}** سم (-${e.val}).`); }
                    e.turns--; return e.turns > 0;
                });
            }

            if (monster.hp <= 0) {
                ongoing = false;
                await battleMsg.edit({ components: [] }).catch(()=>{});
                await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])] }).catch(()=>{});

                const bonusMultiplier = 1 + ((gateLevel - 1) * 0.1); 
                let baseMora = getBaseFloorMora(floor);

                // 🔥 تقليل الجائزة للوحوش الضعيفة (طوابق 1-10) 🔥
                // إذا كان الوحش ضعيفاً جداً (10% HP)، نقلل الجائزة بنسبة كبيرة
                let weakMonsterPenalty = 1.0;
                if (floor <= 4) weakMonsterPenalty = 0.4;      // 60% خصم لأن الوحش دمه 10%
                else if (floor <= 10) weakMonsterPenalty = 0.7; // 30% خصم لأن الوحش دمه 20%
                // من طابق 11+ الجائزة كاملة

                let floorMora = Math.floor(baseMora * weakMonsterPenalty * bonusMultiplier);
                
                // 🔥 قاعدة: كل 1 اكس بي = 3 مورا 🔥
                let floorXp = Math.floor(floorMora / 3); 

                if (floor >= 5) { 
                    floorXp = Math.floor(floorXp / players.length); 
                    floorMora = Math.floor(floorMora / players.length); 
                }
                
                players.forEach(p => { if (!p.isDead) { p.loot.mora += floorMora; p.loot.xp += floorXp; } });

                totalAccumulatedCoins += floorMora;
                totalAccumulatedXP += floorXp;

                if (floor === maxFloors) {
                    await sendEndMessage(mainChannel, threadChannel, players, floor, "win", sql, guild.id, hostId);
                    return; 
                }

                // ================================================================
                // 🔥🔥🔥 إيمبد الاستراحة بين الطوابق  🔥🔥🔥
                // ================================================================
                
                // حساب البف المعروض (للعرض فقط)
                const nextBuff = getDungeonBuff(floor + 1); // البف القادم
                let buffString = "لا يوجد تعزيز حالياً";
                if (nextBuff.percent > 0) buffString = `+${nextBuff.percent}% لمدة ${nextBuff.minutes}د`;

                const decisionEmbed = new EmbedBuilder()
                    .setTitle('❖ استـراحـة بيـن الطـوابـق')
                    .setDescription([
                        `✶ نجحتـم في تصفية الطابق الـ: **${floor}**`,
                        `✶ عثرتم على منصـة استراحـة بين الطابقين`,
                        `✶ تـم استعادة صحة المغامرين بنسبة **%30**`,
                        `\n**✶ احصـاء مجمـوع الغنـائـم لكل شخص:**`,
                        `✬ Mora: **${totalAccumulatedCoins.toLocaleString()}** ${EMOJI_MORA}`,
                        `✬ XP: **${totalAccumulatedXP.toLocaleString()}** ${EMOJI_XP}`,
                        `✬ التعزيز القادم: **${buffString}** ${EMOJI_BUFF}`,
                        `\n- الخـيار للقـائـد الاستمرار والانسحاب بالغنائم ! ام المخاطرة للطابـق التـالي ...`
                    ].join('\n'))
                    .setColor(Colors.Red)
                    .setImage('https://i.postimg.cc/KcJ6gtzV/22.jpg');

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('dungeon_continue').setLabel('الاستمرار').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('dungeon_retreat').setLabel('انسـحـاب').setStyle(ButtonStyle.Danger)
                );

                const dMsg = await threadChannel.send({ embeds: [decisionEmbed], components: [row] });
                
                const floorDecision = await new Promise(resolve => {
                    const decisionCollector = dMsg.createMessageComponentCollector({ time: 60000 });
                    
                    decisionCollector.on('collect', async i => {
                         const clicker = players.find(p => p.id === i.user.id);
                         
                         if (i.customId === 'dungeon_retreat') {
                             if (i.user.id === hostId) {
                                 await i.update({ components: [] });
                                 resolve('retreat');
                                 decisionCollector.stop();
                             } else if (clicker) {
                                 // انسحاب فردي
                                 let pMora = clicker.loot.mora;
                                 let pXp = clicker.loot.xp;
                                 if (pMora > 0 || pXp > 0) {
                                     sql.prepare("UPDATE levels SET xp = xp + ?, mora = mora + ? WHERE user = ? AND guild = ?").run(pXp, pMora, clicker.id, guild.id);
                                 }
                                 
                                 players = players.filter(p => p.id !== clicker.id);
                                 
                                 await i.reply({ content: `👋 **${clicker.name}** قرر الانسحاب والاكتفاء بالغنائم!`, ephemeral: false });
                                 
                                 if (players.length === 0) {
                                     resolve('retreat');
                                     decisionCollector.stop();
                                 }
                             } else {
                                 i.reply({ content: "لست مشاركاً في المعركة.", ephemeral: true });
                             }
                         } else if (i.customId === 'dungeon_continue') {
                             if (i.user.id === hostId) {
                                 await i.update({ content: `**قـرر القـائد الاستـمرار وغزو الطـابق التالي .. يتقدم الفريق نحو الظلام !**`, components: [], embeds: [] });
                                 resolve('continue');
                                 decisionCollector.stop();
                             } else {
                                 i.reply({ content: "فقط القائد يملك قرار الاستمرار.", ephemeral: true });
                             }
                         }
                    });

                    decisionCollector.on('end', (c, reason) => {
                        if (reason !== 'user') resolve('retreat'); 
                    });
                });

                if (floorDecision === 'retreat') {
                    await sendEndMessage(mainChannel, threadChannel, players, floor, "retreat", sql, guild.id, hostId);
                    return;
                }
                
                players.forEach(p => { if(!p.isDead) p.hp = Math.min(p.hp + Math.floor(p.maxHp * 0.3), p.maxHp); });

            } else {
                turnCount++; 
                const alivePlayers = players.filter(p => !p.isDead);
                
                if (alivePlayers.length > 0) {
                    const isLowHp = monster.hp < (monster.maxHp * 0.3); 
                    
                    let target = null;
                    if (monster.targetFocusId) {
                        target = alivePlayers.find(p => p.id === monster.targetFocusId);
                        monster.targetFocusId = null; 
                        if (target) log.push(`👁️ **الوحش يركز غضبه على ${target.name} لأنه لم يهاجم!**`);
                    }

                    if (!target) {
                        target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
                    }
                    
                    const rampUpMultiplier = 1 + (turnCount * 0.05);
                    const currentMonsterAtk = Math.floor(monster.atk * rampUpMultiplier);

                    let dmg = currentMonsterAtk;
                    let actionLog = "";

                    const useSkill = Math.random() < (isLowHp ? 0.5 : 0.3);

                    if (useSkill) {
                        const skillRoll = Math.random();
                        
                        if (alivePlayers.length > 1 && skillRoll > 0.6) {
                            alivePlayers.forEach(p => {
                                let aoeDmg = Math.floor(currentMonsterAtk * 0.7);
                                if (p.defending) aoeDmg = Math.floor(aoeDmg * 0.5);
                                if (p.shield > 0) {
                                    if (aoeDmg > p.shield) { aoeDmg -= p.shield; p.shield = 0; } else { p.shield -= aoeDmg; aoeDmg = 0; }
                                }
                                if (p.id === OWNER_ID) aoeDmg = Math.floor(aoeDmg * 0.1); 

                                p.hp -= aoeDmg;
                                if (p.hp <= 0) { p.hp = 0; p.isDead = true; }
                            });
                            log.push(`🌋 **${monster.name}** أطلق زلزالاً مدمراً على الفريق!`);
                        }
                        else if (isLowHp && skillRoll > 0.3) {
                            let lifeDmg = Math.floor(currentMonsterAtk * 1.2);
                            if (target.defending) lifeDmg = Math.floor(lifeDmg * 0.5);
                            if (target.id === OWNER_ID) lifeDmg = Math.floor(lifeDmg * 0.1);

                            target.hp -= lifeDmg;
                            monster.hp += Math.floor(lifeDmg * 0.5); 
                            log.push(`🩸 **${monster.name}** امتص حياة **${target.name}**! (+${Math.floor(lifeDmg * 0.5)} HP)`);
                            if (target.hp <= 0) { target.hp = 0; target.isDead = true; log.push(`💀 **${target.name}** سقط!`); }
                        }
                        else {
                            let critDmg = Math.floor(currentMonsterAtk * 1.5);
                            if (target.defending) critDmg = Math.floor(critDmg * 0.7); 
                            if (target.shield > 0) {
                                if (critDmg > target.shield) { critDmg -= target.shield; target.shield = 0; } else { target.shield -= critDmg; critDmg = 0; }
                            }
                            if (target.id === OWNER_ID) critDmg = Math.floor(critDmg * 0.1);

                            target.hp -= critDmg;
                            log.push(`💥 **${monster.name}** سدد ضربة ساحقة لـ **${target.name}** (${critDmg})!`);
                            if (target.hp <= 0) { target.hp = 0; target.isDead = true; log.push(`💀 **${target.name}** سقط!`); }
                        }
                    } 
                    else {
                        if (target.defending) dmg = Math.floor(dmg * 0.5);
                        if (target.shield > 0) {
                            if (dmg > target.shield) { dmg -= target.shield; target.shield = 0; } else { target.shield -= dmg; dmg = 0; }
                        }
                        
                        let isEvaded = false;
                        const evasionEffect = target.effects.find(e => e.type === 'evasion');
                        if (evasionEffect && Math.random() < evasionEffect.val) isEvaded = true;
                        const counterEffect = target.effects.find(e => e.type === 'counter');

                        if (isEvaded) {
                            log.push(`👻 **${target.name}** تفادى!`);
                        } else if (counterEffect) {
                            const reflectedDmg = Math.floor(currentMonsterAtk * counterEffect.val);
                            monster.hp -= reflectedDmg;
                            log.push(`🔄 **${target.name}** عكس الهجوم (${reflectedDmg})!`);
                        } else {
                            if (target.id === OWNER_ID) dmg = Math.floor(dmg * 0.1);
                            
                            target.hp -= dmg;
                            log.push(`👹 **${monster.name}** ضرب **${target.name}** (${dmg})`);
                            if (target.hp <= 0) { target.hp = 0; target.isDead = true; log.push(`💀 **${target.name}** سقط!`); }
                        }
                    }
                }

                if (players.every(p => p.isDead)) {
                    ongoing = false;
                    await battleMsg.edit({ components: [] }).catch(()=>{});
                    await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])] }).catch(()=>{});
                    await sendEndMessage(mainChannel, threadChannel, players, floor, "lose", sql, guild.id, hostId);
                    return;
                }
                players.forEach(p => p.defending = false);
                if (log.length > 5) log = log.slice(-5);
                await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])] }).catch(()=>{});
            }
        }
    }
}

async function sendEndMessage(mainChannel, thread, players, floor, status, sql, guildId, hostId) {
    let title = "", color = "", randomImage = null;

    if (status === 'win') {
        title = "❖ أسطـورة الدانـجون !";
        color = "#00FF00"; randomImage = WIN_IMAGES[0];
    } else if (status === 'retreat') {
        title = "❖ انـسـحـاب تـكـتيـكـي !";
        color = "#FFFF00"; randomImage = WIN_IMAGES[0];
    } else {
        title = "❖ هزيمـة ساحقـة ...";
        color = "#FF0000"; randomImage = LOSE_IMAGES[1];
    }

    let mvpPlayer = players.length > 0 ? players.reduce((prev, current) => (prev.totalDamage > current.totalDamage) ? prev : current) : null;
    
    // 🔥 حساب التعزيز النهائي بناءً على الطابق الذي وصلوا له 🔥
    const buffData = getDungeonBuff(floor);
    let buffText = "";

    const durationMs = buffData.minutes * 60 * 1000;
    const expire = Date.now() + durationMs;

    if ((status === 'win' || status === 'retreat') && buffData.percent > 0) {
        buffText = `- تـعـزيـز (+XP/Mora): +${buffData.percent}% (${buffData.minutes}د) ${EMOJI_BUFF}`;
        players.forEach(p => {
             sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, p.id, buffData.percent, expire, 'xp', buffData.percent / 100);
             sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, p.id, buffData.percent, expire, 'mora', buffData.percent / 100);
        });
    } else if (status === 'lose') {
        // عند الخسارة، عقاب بسيط (نفس المدة والنسبة لكن بالسالب)
        const nerfPercent = Math.min(10, Math.floor(floor / 2));
        buffText = `- لـعـنـة (-XP/Mora): -${nerfPercent}% (10د) ${EMOJI_NERF}`;
        const nerfExpire = Date.now() + (10 * 60 * 1000);
        players.forEach(p => {
             sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, p.id, -nerfPercent, nerfExpire, 'xp', -nerfPercent / 100);
             sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, p.id, -nerfPercent, nerfExpire, 'mora', -nerfPercent / 100);
        });
    }

    let lootString = "";
    players.forEach(p => {
        let finalMora = p.loot.mora, finalXp = p.loot.xp;
        if (p.isDead) { finalMora = Math.floor(finalMora * 0.5); finalXp = Math.floor(finalXp * 0.5); }
        if (finalMora > 0 || finalXp > 0) sql.prepare("UPDATE levels SET xp = xp + ?, mora = mora + ? WHERE user = ? AND guild = ?").run(finalXp, finalMora, p.id, guildId);
          
        lootString += `✬ **${p.name}** ${p.isDead ? '(💀 نصف الغنائم)' : ''}: ${finalMora} ${EMOJI_MORA} | ${finalXp} XP\n`;
    });

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(`**✶ تقـريـر المعـركـة (طابق ${floor}):**\nMVP: ${mvpPlayer ? `<@${mvpPlayer.id}> (${mvpPlayer.totalDamage.toLocaleString()})` : 'N/A'}\n\n**✶ المكافآت:**\n${buffText}\n\n${lootString}`)
        .setColor(color)
        .setTimestamp();

    if (randomImage) embed.setImage(randomImage);
    const mentions = players.map(p => `<@${p.id}>`).join(' ');

    await mainChannel.send({ content: `✬ ${mentions}\n`, embeds: [embed] });
    activeDungeonRequests.delete(hostId);
      
    await thread.send({ content: `**✶ انتهت الرحلة، سيتم إغلاق البوابة...**` });
    setTimeout(async () => { try { await thread.delete(); } catch (err) {} }, 10000); 
}

function generateBattleEmbed(players, monster, floor, theme, log, actedPlayers = [], color = '#2F3136') {
    const embed = new EmbedBuilder()
        .setTitle(`${theme.emoji} الطابق ${floor} | ضد ${monster.name}`)
        .setColor(color);

    let monsterStatus = "";
    if (monster.effects.some(e => e.type === 'poison')) monsterStatus += " ☠️";
    if (monster.effects.some(e => e.type === 'weakness')) monsterStatus += " 📉";

    const monsterBar = buildHpBar(monster.hp, monster.maxHp);
    embed.addFields({ 
        name: `👹 **${monster.name}** ${monsterStatus}`, 
        value: `${monsterBar} \`[${monster.hp}/${monster.maxHp}]\``, 
        inline: false 
    });

    let teamStatus = players.map(p => {
        const icon = p.isDead ? '💀' : (p.defending ? '🛡️' : '❤️');
        const hpBar = p.isDead ? 'MORT' : buildHpBar(p.hp, p.maxHp, p.shield);
          
        let displayName;
        if (p.isDead || actedPlayers.includes(p.id)) {
            displayName = `**${p.name}**`; 
        } else {
            displayName = `<@${p.id}>`; 
        }

        return `${icon} ${displayName}\n${hpBar}`;
    }).join('\n\n');

    embed.addFields({ name: `🛡️ **فريق المغامرين**`, value: teamStatus, inline: false  });

    if (log.length > 0) {
        embed.addFields({ name: "احـداث المعركة:", value: log.join('\n'), inline: false });
    }

    return embed;
}

function generateBattleRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('atk').setLabel('هجوم').setEmoji('⚔️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('skill').setLabel('مهارات').setEmoji('✨').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('heal').setLabel('جرعة').setEmoji('🧪').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('def').setLabel('دفاع').setEmoji('🛡️').setStyle(ButtonStyle.Secondary)
    );
}

module.exports = { startDungeon };
