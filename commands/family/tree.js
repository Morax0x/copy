// commands/family/tree.js

const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const Canvas = require('canvas');
const path = require('path');

// ✅✅ إعدادات النظام ✅✅
const TEST_MODE = false; 
const CHILDREN_PER_PAGE = 10; // 🔥 تم التعديل: 10 أبناء في الصفحة الواحدة

// الألوان
const THEME = {
    BG_TOP: "#14161f",    
    BG_BOT: "#0a0b10",    
    GRID: "rgba(255, 255, 255, 0.03)", 
    MALE: "#00a8ff",
    FEMALE: "#ff0055",
    DEFAULT: "#00ff88",
    GOLD: "#ffd700",
    LINE: "#cfd8dc",      
    TEXT: "#ffffff",
    NAME_BG: "rgba(0, 0, 0, 0.85)" 
};

// الأبعاد
const DIMS = {
    NODE: 80,      // أنت
    PARTNER: 65,   // الزوجة
    KID: 60,       // الابن
    GRAND: 45,     // الحفيد
    PARENT: 70,    // الأب/الأم
    SIBLING: 60,   // الأخ/الأخت
    LEVEL_GAP: 250, // مسافة عمودية كافية
    SIB_GAP: 30,    // تقليل المسافة بين الأبناء قليلاً ليناسب الـ 10
};

// حساب الإحداثيات ديناميكياً
const Y_PARENTS = 120;
const Y_MAIN = Y_PARENTS + DIMS.LEVEL_GAP;
const Y_KIDS = Y_MAIN + DIMS.LEVEL_GAP;
const Y_GRAND = Y_KIDS + DIMS.LEVEL_GAP;
const CANVAS_HEIGHT = Y_GRAND + DIMS.GRAND + 80;

// دالة مساعدة: جلب لون العضو
async function getUserColor(client, userId, guild) {
    if (TEST_MODE) return THEME.DEFAULT;
    try {
        const sql = client.sql;
        const config = sql.prepare("SELECT * FROM family_config WHERE guildID = ?").get(guild.id);
        if (!config) return THEME.DEFAULT;
        
        let member = guild.members.cache.get(userId);
        if (!member) member = await guild.members.fetch(userId).catch(() => null);
        if (!member) return THEME.DEFAULT;
        
        const checkRole = (rolesData) => {
            if (!rolesData) return false;
            try {
                const roleIds = JSON.parse(rolesData);
                if (Array.isArray(roleIds)) return roleIds.some(id => member.roles.cache.has(id));
            } catch {
                return member.roles.cache.has(rolesData);
            }
            return false;
        };

        if (checkRole(config.maleRole)) return THEME.MALE;
        if (checkRole(config.femaleRole)) return THEME.FEMALE;
        return THEME.DEFAULT;
    } catch { return THEME.DEFAULT; }
}

// ==========================================
// 🎨 المحرك الرسومي المطور
// ==========================================
async function drawTreePage(treeData, pageIndex) {
    // تقسيم الأبناء لصفحات
    const start = pageIndex * CHILDREN_PER_PAGE;
    const end = start + CHILDREN_PER_PAGE;
    const currentChildren = treeData.children.slice(start, end);

    // حساب العرض المطلوب للأبناء (الحساب التلقائي للعرض)
    let childBlocks = [];
    let childrenTotalWidth = 0;
    
    for (let child of currentChildren) {
        const spouseW = (child.partners.length * (DIMS.PARTNER * 2 + 10));
        const topW = (DIMS.KID * 2) + spouseW;
        
        const grandCount = child.offspring.length;
        const botW = grandCount * (DIMS.GRAND * 2 + 5); // تقليل المسافة بين الأحفاد
        
        const blockW = Math.max(topW, botW, DIMS.KID * 2.5);
        
        childBlocks.push({ data: child, width: blockW, spouseW: spouseW });
        childrenTotalWidth += blockW + DIMS.SIB_GAP;
    }

    // حساب عرض الطبقات الأخرى
    const leftSiblingsWidth = treeData.siblings.left.length * (DIMS.SIBLING * 2 + 15);
    const rightSiblingsWidth = treeData.siblings.right.length * (DIMS.SIBLING * 2 + 15);
    const parentsWidth = (treeData.parents.length * (DIMS.PARENT * 2 + 40));
    const partnersWidth = (treeData.partners.length * (DIMS.PARTNER * 2 + 20)) + (DIMS.NODE * 2);
    const mainRowWidth = partnersWidth + leftSiblingsWidth + rightSiblingsWidth + 150;
    
    // 🔥 العرض النهائي: يأخذ الأكبر بين عرض الأبناء (الـ 10) أو عرض الصف الرئيسي
    const canvasWidth = Math.max(childrenTotalWidth, mainRowWidth, parentsWidth, 1400) + 100;
    const centerX = canvasWidth / 2;

    const canvas = Canvas.createCanvas(canvasWidth, CANVAS_HEIGHT);
    const ctx = canvas.getContext('2d');

    // الخلفية والشبكة
    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    grad.addColorStop(0, THEME.BG_TOP);
    grad.addColorStop(1, THEME.BG_BOT);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasWidth, CANVAS_HEIGHT);

    ctx.lineWidth = 1;
    ctx.strokeStyle = THEME.GRID;
    const gridSize = 50;
    for(let x=0; x<canvasWidth; x+=gridSize) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,CANVAS_HEIGHT); ctx.stroke(); }
    for(let y=0; y<CANVAS_HEIGHT; y+=gridSize) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvasWidth,y); ctx.stroke(); }

    // Vignette
    const radGrad = ctx.createRadialGradient(centerX, CANVAS_HEIGHT/2, 100, centerX, CANVAS_HEIGHT/2, canvasWidth);
    radGrad.addColorStop(0, "rgba(0,0,0,0)");
    radGrad.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, canvasWidth, CANVAS_HEIGHT);

    // --- دوال الرسم ---
    function drawNameLabel(name, x, y, color) {
        const fontSize = 18;
        ctx.font = `bold ${fontSize}px "Sans", "Arial"`; 
        const textMetrics = ctx.measureText(name);
        const textWidth = textMetrics.width;
        const boxWidth = textWidth + 20;
        const boxHeight = 35;
        const boxX = x - (boxWidth / 2);
        const boxY = y + 15;

        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 5;
        ctx.fillStyle = THEME.NAME_BG;
        ctx.beginPath();
        if(ctx.roundRect) ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 10);
        else ctx.rect(boxX, boxY, boxWidth, boxHeight);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.fillStyle = THEME.TEXT;
        ctx.textAlign = "center";
        ctx.fillText(name, x, boxY + 24);
    }

    async function drawCircleImg(user, x, y, radius, isMain=false) {
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        try {
            let url = typeof user.displayAvatarURL === 'function' ? user.displayAvatarURL({ extension: 'png', size: 128 }) : user.displayAvatarURL; 
            const img = await Canvas.loadImage(url);
            ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);
        } catch (err) {
            ctx.fillStyle = "#2c3e50";
            ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
        ctx.restore();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.lineWidth = isMain ? 6 : 4;
        ctx.strokeStyle = isMain ? THEME.GOLD : (user.color || THEME.DEFAULT);
        ctx.stroke();
        
        const name = user.username || user.displayName || "???";
        const shortName = name.length > 12 ? name.substring(0, 10)+".." : name;
        drawNameLabel(shortName, x, y + radius, isMain ? THEME.GOLD : (user.color || THEME.DEFAULT));
    }

    function drawLine(x1, y1, x2, y2, color=THEME.LINE, width=3) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 2;
        ctx.stroke();
        ctx.restore();
    }

    function drawElbow(x1, y1, x2, y2, color=THEME.LINE) {
        const midY = (y1 + y2) / 2;
        drawLine(x1, y1, x1, midY, color);
        drawLine(x1, midY, x2, midY, color);
        drawLine(x2, midY, x2, y2, color);
    }

    // ==========================================
    // 🖌️ رسم الخطوط (Layer 1)
    // ==========================================

    // 1. الآباء
    if (treeData.parents.length > 0) {
        const pTotalW = treeData.parents.length * (DIMS.PARENT * 2 + 40);
        let currentPX = centerX - (pTotalW / 2) + DIMS.PARENT + 20;
        
        for(const p of treeData.parents) {
            drawLine(currentPX, Y_PARENTS + DIMS.PARENT, centerX, Y_MAIN - DIMS.NODE - 40);
            currentPX += DIMS.PARENT * 2 + 40;
        }
    }

    // 2. الأخوة (Siblings)
    const siblingsLineY = Y_MAIN - DIMS.NODE - 60; 
    
    // اليسار
    let sX = centerX - DIMS.NODE - 60; 
    for(const sib of treeData.siblings.left) {
        drawLine(centerX, siblingsLineY, sX, siblingsLineY); 
        drawLine(sX, siblingsLineY, sX, Y_MAIN - DIMS.SIBLING); 
        sX -= (DIMS.SIBLING * 2 + 20);
    }
    // اليمين (بعد الزوجات)
    let rightStart = centerX + DIMS.NODE + (treeData.partners.length * (DIMS.PARTNER * 2 + 20)) + 60;
    for(const sib of treeData.siblings.right) {
        drawLine(centerX, siblingsLineY, rightStart, siblingsLineY);
        drawLine(rightStart, siblingsLineY, rightStart, Y_MAIN - DIMS.SIBLING);
        rightStart += (DIMS.SIBLING * 2 + 20);
    }
    // توصيل المستخدم بخط الأخوة
    if (treeData.siblings.left.length > 0 || treeData.siblings.right.length > 0) {
        drawLine(centerX, siblingsLineY, centerX, Y_MAIN - DIMS.NODE);
    }

    // 3. الزوجات
    let pX = centerX + DIMS.NODE + 40;
    treeData.partners.forEach((p) => {
        drawLine(centerX + DIMS.NODE, Y_MAIN, pX - DIMS.PARTNER, Y_MAIN, THEME.FEMALE); 
        pX += DIMS.PARTNER * 2 + 20;
    });

    // 4. الأبناء والأحفاد
    if (childBlocks.length > 0) {
        drawElbow(centerX, Y_MAIN + DIMS.NODE, centerX, Y_KIDS - DIMS.KID - 40);
        
        let currentX = centerX - (childrenTotalWidth / 2);
        
        for(const block of childBlocks) {
            const blockCenter = currentX + (block.width / 2);
            const kidRealX = blockCenter - (block.spouseW / 2);

            drawElbow(centerX, Y_MAIN + DIMS.NODE, kidRealX, Y_KIDS - DIMS.KID);
            
            // خط زوجات الابن
            let spX = kidRealX + DIMS.KID + 20;
            let lastSpouseX = kidRealX;
            if (block.data.partners) {
                for (const sp of block.data.partners) {
                    drawLine(kidRealX + DIMS.KID, Y_KIDS, spX - DIMS.PARTNER, Y_KIDS, THEME.FEMALE);
                    lastSpouseX = spX;
                    spX += DIMS.PARTNER * 2 + 10;
                }
            }

            // خط الأحفاد
            let parentsCenterX = (kidRealX + lastSpouseX) / 2; 
            if (block.data.offspring.length > 0) {
                const grandCount = block.data.offspring.length;
                let grandX = blockCenter - ((grandCount * (DIMS.GRAND * 2 + 5)) / 2) + DIMS.GRAND;
                for (const grand of block.data.offspring) {
                    drawElbow(parentsCenterX, Y_KIDS + DIMS.KID, grandX, Y_GRAND - DIMS.GRAND);
                    grandX += DIMS.GRAND * 2 + 5;
                }
            }
            currentX += block.width + DIMS.SIB_GAP;
        }
    }

    // ==========================================
    // 🖼️ رسم الصور (Layer 2)
    // ==========================================

    // 1. الآباء
    if (treeData.parents.length > 0) {
        const pTotalW = treeData.parents.length * (DIMS.PARENT * 2 + 40);
        let currentPX = centerX - (pTotalW / 2) + DIMS.PARENT + 20;
        for(const parent of treeData.parents) {
            await drawCircleImg(parent, currentPX, Y_PARENTS, DIMS.PARENT);
            currentPX += DIMS.PARENT * 2 + 40;
        }
    }

    // 2. الأخوة (يسار)
    sX = centerX - DIMS.NODE - 60;
    for(const sib of treeData.siblings.left) {
        await drawCircleImg(sib, sX, Y_MAIN, DIMS.SIBLING);
        sX -= (DIMS.SIBLING * 2 + 20);
    }

    // 3. المستخدم الرئيسي
    await drawCircleImg(treeData.main, centerX, Y_MAIN, DIMS.NODE, true);

    // 4. الزوجات (يمين المستخدم)
    pX = centerX + DIMS.NODE + 40;
    for(const p of treeData.partners) {
        await drawCircleImg(p, pX, Y_MAIN, DIMS.PARTNER);
        pX += DIMS.PARTNER * 2 + 20;
    }

    // 5. الأخوة (يمين بعد الزوجات)
    rightStart = centerX + DIMS.NODE + (treeData.partners.length * (DIMS.PARTNER * 2 + 20)) + 60;
    for(const sib of treeData.siblings.right) {
        await drawCircleImg(sib, rightStart, Y_MAIN, DIMS.SIBLING);
        rightStart += (DIMS.SIBLING * 2 + 20);
    }

    // 6. الأبناء والأحفاد
    let currentX = centerX - (childrenTotalWidth / 2);
    for(const block of childBlocks) {
        const blockCenter = currentX + (block.width / 2);
        const kidRealX = blockCenter - (block.spouseW / 2);
        
        await drawCircleImg(block.data, kidRealX, Y_KIDS, DIMS.KID);

        let spX = kidRealX + DIMS.KID + 20;
        if (block.data.partners) {
            for (const sp of block.data.partners) {
                await drawCircleImg(sp, spX, Y_KIDS, DIMS.PARTNER);
                spX += DIMS.PARTNER * 2 + 10;
            }
        }

        if (block.data.offspring.length > 0) {
            const grandCount = block.data.offspring.length;
            let grandX = blockCenter - ((grandCount * (DIMS.GRAND * 2 + 5)) / 2) + DIMS.GRAND;
            for (const grand of block.data.offspring) {
                await drawCircleImg(grand, grandX, Y_GRAND, DIMS.GRAND);
                grandX += DIMS.GRAND * 2 + 5;
            }
        }
        currentX += block.width + DIMS.SIB_GAP;
    }

    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = '20px "Sans", "Arial"';
    ctx.fillText(`الصفحة ${pageIndex + 1}`, canvasWidth - 80, CANVAS_HEIGHT - 30);

    return new AttachmentBuilder(canvas.toBuffer(), { name: 'family-tree.png' });
}

module.exports = {
    name: 'tree',
    description: 'عرض شجرة العائلة (شاملة)',
    aliases: ['شجرة', 'family'],
    
    async execute(message, args) {
        const client = message.client;
        const guild = message.guild;
        const sql = client.sql;

        const targetMember = message.mentions.members.first() || 
                             message.guild.members.cache.get(args[0]) || 
                             message.member;
                             
        const targetUser = targetMember.user;

        // دالة لجلب معلومات مستخدم بسرعة
        const fetchUser = async (id) => {
            try {
                let m = guild.members.cache.get(id);
                if(!m) m = await guild.members.fetch(id).catch(() => null);
                if(!m) return null;
                const color = await getUserColor(client, id, guild);
                return {
                    username: m.user.username,
                    id: id,
                    color: color,
                    displayAvatarURL: () => m.user.displayAvatarURL({ extension: 'png' })
                };
            } catch { return null; }
        };

        // هيكل البيانات الأساسي
        let treeData = {
            main: { 
                username: targetUser.username, 
                color: await getUserColor(client, targetUser.id, guild), 
                id: targetUser.id, 
                displayAvatarURL: () => targetUser.displayAvatarURL({ extension: 'png' }) 
            },
            parents: [],
            partners: [],
            children: [],
            siblings: { left: [], right: [] } 
        };

        // 1. جلب الآباء
        const parentRows = sql.prepare("SELECT parentID FROM children WHERE childID = ? AND guildID = ?").all(targetUser.id, guild.id);
        for (const row of parentRows) {
            const p = await fetchUser(row.parentID);
            if (p) treeData.parents.push(p);
        }

        // 2. جلب الأخوة (من لديهم نفس الآباء)
        if (treeData.parents.length > 0) {
            const parentIDs = treeData.parents.map(p => p.id);
            const siblingRows = sql.prepare(`
                SELECT DISTINCT childID FROM children 
                WHERE parentID IN (${parentIDs.map(() => '?').join(',')}) 
                AND childID != ? AND guildID = ?
            `).all(...parentIDs, targetUser.id, guild.id);

            for (let i = 0; i < siblingRows.length; i++) {
                const s = await fetchUser(siblingRows[i].childID);
                if (s) {
                    if (i % 2 === 0) treeData.siblings.left.push(s);
                    else treeData.siblings.right.push(s);
                }
            }
        }

        // 3. جلب الزوجات
        const marriages = sql.prepare("SELECT partnerID FROM marriages WHERE userID = ? AND guildID = ?").all(targetUser.id, guild.id);
        for (const m of marriages) {
            const p = await fetchUser(m.partnerID);
            if (p) treeData.partners.push(p);
        }

        // 4. جلب الأبناء (Bulk Fetch Optimization) 🔥🔥
        // بدل ما ندور على كل ابن ونجيب تفاصيله، بنجمع كل الآيديات أولاً
        
        let childrenIDs = new Set();
        
        // أبناءك المباشرين
        const myKids = sql.prepare("SELECT childID FROM children WHERE parentID = ? AND guildID = ?").all(targetUser.id, guild.id);
        myKids.forEach(k => childrenIDs.add(k.childID));

        // أبناء الشركاء (Step Kids)
        for (const p of treeData.partners) {
            const stepKids = sql.prepare("SELECT childID FROM children WHERE parentID = ? AND guildID = ?").all(p.id, guild.id);
            stepKids.forEach(k => childrenIDs.add(k.childID));
        }

        const allChildIDs = Array.from(childrenIDs);

        if (allChildIDs.length > 0) {
            // الآن نجهز البيانات بالجملة
            
            for (const childID of allChildIDs) {
                const childUser = await fetchUser(childID);
                if (!childUser) continue;

                // جلب زوجات هذا الابن
                const cPartnersRows = sql.prepare("SELECT partnerID FROM marriages WHERE userID = ? AND guildID = ?").all(childID, guild.id);
                let cPartners = [];
                for(const r of cPartnersRows) {
                    const cp = await fetchUser(r.partnerID);
                    if(cp) cPartners.push(cp);
                }

                // جلب أحفاد هذا الابن (منه أو من زوجاته)
                let grandIDs = new Set();
                
                // أحفاد من صلب الابن
                const g1 = sql.prepare("SELECT childID FROM children WHERE parentID = ? AND guildID = ?").all(childID, guild.id);
                g1.forEach(g => grandIDs.add(g.childID));
                
                // أحفاد من زوجات الابن
                for(const cp of cPartners) {
                    const g2 = sql.prepare("SELECT childID FROM children WHERE parentID = ? AND guildID = ?").all(cp.id, guild.id);
                    g2.forEach(g => grandIDs.add(g.childID));
                }

                let grandChildren = [];
                for(const gid of grandIDs) {
                    const gUser = await fetchUser(gid);
                    if(gUser) grandChildren.push(gUser);
                }

                treeData.children.push({
                    ...childUser,
                    partners: cPartners,
                    offspring: grandChildren
                });
            }
        }

        // التحقق من الوحدة
        if (treeData.parents.length === 0 && treeData.partners.length === 0 && treeData.children.length === 0 && treeData.siblings.left.length === 0 && treeData.siblings.right.length === 0) {
            const msg = await message.reply({ content: `🍂 **شجرة ${targetUser.username} فارغة تماماً!**` });
            setTimeout(() => msg.delete().catch(() => {}), 5000);
            return; 
        }

        let currentPage = 0;
        const totalPages = Math.ceil(treeData.children.length / CHILDREN_PER_PAGE) || 1;

        const getButtons = (page) => {
            const row = new ActionRowBuilder();
            row.addComponents(
                new ButtonBuilder().setCustomId('prev_tree').setStyle(ButtonStyle.Secondary).setEmoji('1439164494759723029').setDisabled(page === 0),
                new ButtonBuilder().setCustomId('next_tree').setStyle(ButtonStyle.Secondary).setEmoji('1439164491072929915').setDisabled(page >= totalPages - 1)
            );
            return row;
        };

        const img = await drawTreePage(treeData, currentPage);
        const msg = await message.reply({ 
            files: [img],
            components: totalPages > 1 ? [getButtons(currentPage)] : []
        });

        if (totalPages <= 1) return;

        const collector = msg.createMessageComponentCollector({ 
            filter: i => i.user.id === message.author.id, 
            time: 300000,
            componentType: ComponentType.Button 
        });

        collector.on('collect', async i => {
            if (i.customId === 'prev_tree') currentPage--;
            if (i.customId === 'next_tree') currentPage++;
            await i.deferUpdate();
            const newImg = await drawTreePage(treeData, currentPage);
            await i.editReply({ files: [newImg], components: [getButtons(currentPage)] });
        });

        collector.on('end', () => msg.edit({ components: [] }).catch(()=>{}));
    }
};
