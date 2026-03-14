const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const Canvas = require('canvas');

const TEST_MODE = false;
const CHILDREN_PER_PAGE = 6; 

const THEME = {
    BG_TOP: "#0f111a",
    BG_BOT: "#06070a",
    GRID: "rgba(255, 255, 255, 0.04)",
    MALE: "#00b4d8",
    FEMALE: "#f72585",
    DEFAULT: "#1dd3b0",
    GOLD: "#ffb703",
    LINE: "#4a4e69",
    TEXT: "#ffffff",
    NAME_BG: "rgba(10, 12, 16, 0.85)"
};

const DIMS = {
    NODE: 80, PARTNER: 65, KID: 60, GRAND: 45, GREAT_GRAND: 35, 
    PARENT: 65, GRANDPARENT: 50, SIBLING: 60, 
    NEPHEW: 30, // 🔥 تم تصغير  أبناء الإخوة بشكل واضح
    LEVEL_GAP: 250, SIB_GAP: 80, 
};

const Y_GRANDPARENTS = 80;
const Y_PARENTS = Y_GRANDPARENTS + DIMS.LEVEL_GAP;
const Y_MAIN = Y_PARENTS + DIMS.LEVEL_GAP;
const Y_NEPHEWS = Y_MAIN + 140; // 🔥 طبقة معزولة لأبناء الإخوة فقط
const Y_KIDS = Y_MAIN + DIMS.LEVEL_GAP;
const Y_GRAND = Y_KIDS + DIMS.LEVEL_GAP;
const Y_GREAT_GRAND = Y_GRAND + DIMS.LEVEL_GAP; 
const CANVAS_HEIGHT = Y_GREAT_GRAND + DIMS.GREAT_GRAND + 100;

async function getUserColor(client, userId, guild, db) {
    if (TEST_MODE) return THEME.DEFAULT;
    try {
        let config;
        try {
            const configRes = await db.query(`SELECT "maleRole", "femaleRole" FROM family_config WHERE "guildID" = $1`, [guild.id]);
            config = configRes.rows[0];
        } catch(e) {
            const configRes = await db.query(`SELECT malerole, femalerole FROM family_config WHERE guildid = $1`, [guild.id]).catch(()=>({rows:[]}));
            config = configRes.rows[0];
        }
        
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

        if (checkRole(config.maleRole || config.malerole)) return THEME.MALE;
        if (checkRole(config.femaleRole || config.femalerole)) return THEME.FEMALE;
        return THEME.DEFAULT;
    } catch { return THEME.DEFAULT; }
}

async function drawTreePage(treeData, pageIndex) {
    const start = pageIndex * CHILDREN_PER_PAGE;
    const end = start + CHILDREN_PER_PAGE;
    const currentChildren = treeData.children.slice(start, end);

    let childBlocks = [];
    let childrenTotalWidth = 0;

    for (let child of currentChildren) {
        const spouseW = child.partners.length * (DIMS.PARTNER * 2 + 20);
        const topW = (DIMS.KID * 2) + spouseW;
        
        let botW = 0;
        for (const grand of child.offspring) {
            const greatCount = grand.offspring ? grand.offspring.length : 0;
            const grandBlockW = Math.max(DIMS.GRAND * 2 + 40, greatCount * (DIMS.GREAT_GRAND * 2 + 20));
            botW += grandBlockW;
        }
        
        const blockW = Math.max(topW, botW, DIMS.KID * 3);
        childBlocks.push({ data: child, width: blockW, spouseW: spouseW });
        childrenTotalWidth += blockW + DIMS.SIB_GAP;
    }

    let leftSiblingsWidth = 0;
    for (const sib of treeData.siblings.left) {
        const nephewCount = sib.nephews ? sib.nephews.length : 0;
        const sibW = Math.max(DIMS.SIBLING * 2.5, nephewCount * (DIMS.NEPHEW * 2 + 20));
        leftSiblingsWidth += sibW + 60;
    }

    let rightSiblingsWidth = 0;
    for (const sib of treeData.siblings.right) {
        const nephewCount = sib.nephews ? sib.nephews.length : 0;
        const sibW = Math.max(DIMS.SIBLING * 2.5, nephewCount * (DIMS.NEPHEW * 2 + 20));
        rightSiblingsWidth += sibW + 60;
    }

    let parentsTotalWidth = 0;
    for (const p of treeData.parents) {
        const gpCount = p.grandparents ? p.grandparents.length : 0;
        const pBlockW = Math.max(DIMS.PARENT * 2 + 80, gpCount * (DIMS.GRANDPARENT * 2 + 40));
        parentsTotalWidth += pBlockW;
    }

    const partnersWidth = (treeData.partners.length * (DIMS.PARTNER * 2 + 40)) + (DIMS.NODE * 2);
    const mainRowWidth = partnersWidth + leftSiblingsWidth + rightSiblingsWidth + 300;

    // زيادة العرض لمنع أي قص
    const canvasWidth = Math.max(childrenTotalWidth, mainRowWidth, parentsTotalWidth, 1800) + 400;
    const centerX = canvasWidth / 2;

    const canvas = Canvas.createCanvas(canvasWidth, CANVAS_HEIGHT);
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    grad.addColorStop(0, THEME.BG_TOP);
    grad.addColorStop(1, THEME.BG_BOT);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasWidth, CANVAS_HEIGHT);

    ctx.lineWidth = 1;
    ctx.strokeStyle = THEME.GRID;
    const gridSize = 60;
    for(let x=0; x<canvasWidth; x+=gridSize) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,CANVAS_HEIGHT); ctx.stroke(); }
    for(let y=0; y<CANVAS_HEIGHT; y+=gridSize) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvasWidth,y); ctx.stroke(); }

    function drawNameLabel(name, x, y, color, isSmall = false) {
        const fontSize = isSmall ? 12 : 16;
        ctx.font = `bold ${fontSize}px "Sans", "Arial"`;
        const textMetrics = ctx.measureText(name);
        const boxWidth = textMetrics.width + (isSmall ? 16 : 24);
        const boxHeight = isSmall ? 22 : 32;
        const boxX = x - (boxWidth / 2);
        const boxY = y + 10;

        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 6;
        ctx.fillStyle = THEME.NAME_BG;
        ctx.beginPath();
        if(ctx.roundRect) ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 8);
        else ctx.rect(boxX, boxY, boxWidth, boxHeight);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = THEME.TEXT;
        ctx.textAlign = "center";
        ctx.fillText(name, x, boxY + (isSmall ? 16 : 22));
    }

    async function drawCircleImg(user, x, y, radius, isMain=false, isSmallLabel=false) {
        ctx.save();
        ctx.shadowColor = isMain ? THEME.GOLD : "rgba(0,0,0,0.7)";
        ctx.shadowBlur = isMain ? 25 : 15;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        try {
            const img = await Canvas.loadImage(user.avatarURL);
            ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);
        } catch (err) {
            ctx.fillStyle = "#1e2233";
            ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
        ctx.restore();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.lineWidth = isMain ? 6 : 4;
        ctx.strokeStyle = isMain ? THEME.GOLD : (user.color || THEME.DEFAULT);
        ctx.stroke();
        
        const name = user.username || "???";
        const shortName = name.length > 12 ? name.substring(0, 10)+".." : name;
        drawNameLabel(shortName, x, y + radius, isMain ? THEME.GOLD : (user.color || THEME.DEFAULT), isSmallLabel);
    }

    function drawLine(x1, y1, x2, y2, color=THEME.LINE, width=3) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 3;
        ctx.stroke();
        ctx.restore();
    }

    function drawElbow(x1, y1, x2, y2, color=THEME.LINE) {
        const midY = (y1 + y2) / 2;
        drawLine(x1, y1, x1, midY, color);
        drawLine(x1, midY, x2, midY, color);
        drawLine(x2, midY, x2, y2, color);
    }

    // --- رسم الخطوط ---
    
    let currentPX = centerX - (parentsTotalWidth / 2);
    for(const p of treeData.parents) {
        const gpCount = p.grandparents ? p.grandparents.length : 0;
        const pBlockW = Math.max(DIMS.PARENT * 2 + 80, gpCount * (DIMS.GRANDPARENT * 2 + 40));
        const pCenterX = currentPX + (pBlockW / 2);

        if (gpCount > 0) {
            let gpX = pCenterX - ((gpCount * (DIMS.GRANDPARENT * 2 + 20)) / 2) + DIMS.GRANDPARENT;
            for (const gp of p.grandparents) {
                drawElbow(pCenterX, Y_PARENTS - DIMS.PARENT, gpX, Y_GRANDPARENTS + DIMS.GRANDPARENT);
                gpX += DIMS.GRANDPARENT * 2 + 20;
            }
        }
        
        drawLine(pCenterX, Y_PARENTS + DIMS.PARENT, centerX, Y_MAIN - DIMS.NODE - 50);
        currentPX += pBlockW;
    }

    const siblingsLineY = Y_MAIN - DIMS.NODE - 50;

    let sX = centerX - DIMS.NODE - 100;
    for(const sib of treeData.siblings.left) {
        const nephewCount = sib.nephews ? sib.nephews.length : 0;
        const sibW = Math.max(DIMS.SIBLING * 2.5, nephewCount * (DIMS.NEPHEW * 2 + 20));
        const sibCenterX = sX - (sibW / 2);
        
        drawLine(centerX, siblingsLineY, sibCenterX, siblingsLineY);
        drawLine(sibCenterX, siblingsLineY, sibCenterX, Y_MAIN - DIMS.SIBLING);

        if (nephewCount > 0) {
            let nephX = sibCenterX - ((nephewCount * (DIMS.NEPHEW * 2 + 20)) / 2) + DIMS.NEPHEW;
            for (const neph of sib.nephews) {
                drawElbow(sibCenterX, Y_MAIN + DIMS.SIBLING, nephX, Y_NEPHEWS - DIMS.NEPHEW); // 🔥 توجيه أبناء الإخوة لطبقتهم الخاصة
                nephX += DIMS.NEPHEW * 2 + 20;
            }
        }
        sX -= sibW + 60;
    }

    let rightStart = centerX + DIMS.NODE + (treeData.partners.length * (DIMS.PARTNER * 2 + 40)) + 100;
    for(const sib of treeData.siblings.right) {
        const nephewCount = sib.nephews ? sib.nephews.length : 0;
        const sibW = Math.max(DIMS.SIBLING * 2.5, nephewCount * (DIMS.NEPHEW * 2 + 20));
        const sibCenterX = rightStart + (sibW / 2);

        drawLine(centerX, siblingsLineY, sibCenterX, siblingsLineY);
        drawLine(sibCenterX, siblingsLineY, sibCenterX, Y_MAIN - DIMS.SIBLING);

        if (nephewCount > 0) {
            let nephX = sibCenterX - ((nephewCount * (DIMS.NEPHEW * 2 + 20)) / 2) + DIMS.NEPHEW;
            for (const neph of sib.nephews) {
                drawElbow(sibCenterX, Y_MAIN + DIMS.SIBLING, nephX, Y_NEPHEWS - DIMS.NEPHEW); // 🔥 توجيههم لطبقة النيبوز
                nephX += DIMS.NEPHEW * 2 + 20;
            }
        }
        rightStart += sibW + 60;
    }

    if (treeData.siblings.left.length > 0 || treeData.siblings.right.length > 0 || treeData.parents.length > 0) {
        drawLine(centerX, siblingsLineY, centerX, Y_MAIN - DIMS.NODE);
    }

    let pX = centerX + DIMS.NODE + 50;
    treeData.partners.forEach((p) => {
        drawLine(centerX + DIMS.NODE, Y_MAIN, pX - DIMS.PARTNER, Y_MAIN, THEME.FEMALE, 4);
        pX += DIMS.PARTNER * 2 + 40;
    });

    if (childBlocks.length > 0) {
        drawElbow(centerX, Y_MAIN + DIMS.NODE, centerX, Y_KIDS - DIMS.KID - 50);
        let currentX = centerX - (childrenTotalWidth / 2);
        
        for(const block of childBlocks) {
            const blockCenter = currentX + (block.width / 2);
            const kidRealX = blockCenter - (block.spouseW / 2);
            drawElbow(centerX, Y_MAIN + DIMS.NODE, kidRealX, Y_KIDS - DIMS.KID);
            
            let spX = kidRealX + DIMS.KID + 30;
            let lastSpouseX = kidRealX;
            if (block.data.partners) {
                for (const sp of block.data.partners) {
                    drawLine(kidRealX + DIMS.KID, Y_KIDS, spX - DIMS.PARTNER, Y_KIDS, THEME.FEMALE, 3);
                    lastSpouseX = spX;
                    spX += DIMS.PARTNER * 2 + 20;
                }
            }

            let parentsCenterX = (kidRealX + lastSpouseX) / 2;
            if (block.data.offspring.length > 0) {
                let grandStartX = currentX; 
                for (const grand of block.data.offspring) {
                    const greatCount = grand.offspring ? grand.offspring.length : 0;
                    const grandBlockW = Math.max(DIMS.GRAND * 2 + 40, greatCount * (DIMS.GREAT_GRAND * 2 + 20));
                    const grandCenterX = grandStartX + (grandBlockW / 2);

                    drawElbow(parentsCenterX, Y_KIDS + DIMS.KID, grandCenterX, Y_GRAND - DIMS.GRAND);

                    if (greatCount > 0) {
                        let greatX = grandCenterX - ((greatCount * (DIMS.GREAT_GRAND * 2 + 20)) / 2) + DIMS.GREAT_GRAND;
                        for (const great of grand.offspring) {
                            drawElbow(grandCenterX, Y_GRAND + DIMS.GRAND, greatX, Y_GREAT_GRAND - DIMS.GREAT_GRAND);
                            greatX += DIMS.GREAT_GRAND * 2 + 20;
                        }
                    }
                    grandStartX += grandBlockW;
                }
            }
            currentX += block.width + DIMS.SIB_GAP;
        }
    }

    // --- رسم الصور ---
    
    currentPX = centerX - (parentsTotalWidth / 2);
    for(const p of treeData.parents) {
        const gpCount = p.grandparents ? p.grandparents.length : 0;
        const pBlockW = Math.max(DIMS.PARENT * 2 + 80, gpCount * (DIMS.GRANDPARENT * 2 + 40));
        const pCenterX = currentPX + (pBlockW / 2);
        
        if (gpCount > 0) {
            let gpX = pCenterX - ((gpCount * (DIMS.GRANDPARENT * 2 + 20)) / 2) + DIMS.GRANDPARENT;
            for (const gp of p.grandparents) {
                await drawCircleImg(gp, gpX, Y_GRANDPARENTS, DIMS.GRANDPARENT);
                gpX += DIMS.GRANDPARENT * 2 + 20;
            }
        }
        await drawCircleImg(p, pCenterX, Y_PARENTS, DIMS.PARENT);
        currentPX += pBlockW;
    }

    sX = centerX - DIMS.NODE - 100;
    for(const sib of treeData.siblings.left) {
        const nephewCount = sib.nephews ? sib.nephews.length : 0;
        const sibW = Math.max(DIMS.SIBLING * 2.5, nephewCount * (DIMS.NEPHEW * 2 + 20));
        const sibCenterX = sX - (sibW / 2);
        
        await drawCircleImg(sib, sibCenterX, Y_MAIN, DIMS.SIBLING);

        if (nephewCount > 0) {
            let nephX = sibCenterX - ((nephewCount * (DIMS.NEPHEW * 2 + 20)) / 2) + DIMS.NEPHEW;
            for (const neph of sib.nephews) {
                await drawCircleImg(neph, nephX, Y_NEPHEWS, DIMS.NEPHEW, false, true); // 🔥 رسم أبناء الإخوة بطبقتهم وبحجم صغير
                nephX += DIMS.NEPHEW * 2 + 20;
            }
        }
        sX -= sibW + 60;
    }

    await drawCircleImg(treeData.main, centerX, Y_MAIN, DIMS.NODE, true);

    pX = centerX + DIMS.NODE + 50;
    for(const p of treeData.partners) {
        await drawCircleImg(p, pX, Y_MAIN, DIMS.PARTNER);
        pX += DIMS.PARTNER * 2 + 40;
    }

    rightStart = centerX + DIMS.NODE + (treeData.partners.length * (DIMS.PARTNER * 40)) + 100;
    for(const sib of treeData.siblings.right) {
        const nephewCount = sib.nephews ? sib.nephews.length : 0;
        const sibW = Math.max(DIMS.SIBLING * 2.5, nephewCount * (DIMS.NEPHEW * 2 + 20));
        const sibCenterX = rightStart + (sibW / 2);
        
        await drawCircleImg(sib, sibCenterX, Y_MAIN, DIMS.SIBLING);

        if (nephewCount > 0) {
            let nephX = sibCenterX - ((nephewCount * (DIMS.NEPHEW * 2 + 20)) / 2) + DIMS.NEPHEW;
            for (const neph of sib.nephews) {
                await drawCircleImg(neph, nephX, Y_NEPHEWS, DIMS.NEPHEW, false, true); // 🔥 رسم أبناء الإخوة بطبقتهم وبحجم صغير
                nephX += DIMS.NEPHEW * 2 + 20;
            }
        }
        rightStart += sibW + 60;
    }

    let currentX = centerX - (childrenTotalWidth / 2);
    for(const block of childBlocks) {
        const blockCenter = currentX + (block.width / 2);
        const kidRealX = blockCenter - (block.spouseW / 2);
        
        await drawCircleImg(block.data, kidRealX, Y_KIDS, DIMS.KID);

        let spX = kidRealX + DIMS.KID + 30;
        if (block.data.partners) {
            for (const sp of block.data.partners) {
                await drawCircleImg(sp, spX, Y_KIDS, DIMS.PARTNER);
                spX += DIMS.PARTNER * 2 + 20;
            }
        }

        if (block.data.offspring.length > 0) {
            let grandStartX = currentX;
            for (const grand of block.data.offspring) {
                const greatCount = grand.offspring ? grand.offspring.length : 0;
                const grandBlockW = Math.max(DIMS.GRAND * 2 + 40, greatCount * (DIMS.GREAT_GRAND * 2 + 20));
                const grandCenterX = grandStartX + (grandBlockW / 2);

                await drawCircleImg(grand, grandCenterX, Y_GRAND, DIMS.GRAND);

                if (greatCount > 0) {
                    let greatX = grandCenterX - ((greatCount * (DIMS.GREAT_GRAND * 2 + 20)) / 2) + DIMS.GREAT_GRAND;
                    for (const great of grand.offspring) {
                        await drawCircleImg(great, greatX, Y_GREAT_GRAND, DIMS.GREAT_GRAND);
                        greatX += DIMS.GREAT_GRAND * 2 + 20;
                    }
                }
                grandStartX += grandBlockW;
            }
        }
        currentX += block.width + DIMS.SIB_GAP;
    }

    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = '20px "Sans", "Arial"';
    ctx.fillText(`الصفحة ${pageIndex + 1}`, canvasWidth - 100, CANVAS_HEIGHT - 30);

    return new AttachmentBuilder(canvas.toBuffer(), { name: 'family-tree.png' });
}

module.exports = {
    name: 'tree',
    description: 'عرض شجرة العائلة الشاملة (تشمل الأجداد، الإخوة، الأبناء وأبناء الإخوة)',
    aliases: ['شجرة', 'family'],
    
    async execute(message, args) {
        const client = message.client;
        const guild = message.guild;
        const db = client.sql;

        const targetMember = message.mentions.members.first() || 
                             message.guild.members.cache.get(args[0]) || 
                             message.member;
                             
        const targetUser = targetMember.user;
        const guildId = guild.id;

        const allInvolvedUserIds = new Set();
        const addId = (id) => { if (id) allInvolvedUserIds.add(id); };
        addId(targetUser.id);

        const getParents = async (id) => {
            let res;
            try { res = await db.query(`SELECT "parentID" FROM children WHERE "childID" = $1 AND "guildID" = $2`, [id, guildId]); }
            catch(e) { res = await db.query(`SELECT parentid FROM children WHERE childid = $1 AND guildid = $2`, [id, guildId]).catch(()=>({rows:[]})); }
            return res.rows.map(r => r.parentID || r.parentid);
        };
        const getChildren = async (id) => {
            let res;
            try { res = await db.query(`SELECT "childID" FROM children WHERE "parentID" = $1 AND "guildID" = $2`, [id, guildId]); }
            catch(e) { res = await db.query(`SELECT childid FROM children WHERE parentid = $1 AND guildid = $2`, [id, guildId]).catch(()=>({rows:[]})); }
            return res.rows.map(r => r.childID || r.childid);
        };
        const getPartners = async (id) => {
            let res;
            try { res = await db.query(`SELECT "partnerID" FROM marriages WHERE "userID" = $1 AND "guildID" = $2`, [id, guildId]); }
            catch(e) { res = await db.query(`SELECT partnerid FROM marriages WHERE userid = $1 AND guildid = $2`, [id, guildId]).catch(()=>({rows:[]})); }
            return res.rows.map(r => r.partnerID || r.partnerid);
        };

        const directParents = await getParents(targetUser.id);
        directParents.forEach(addId);
        let allParentFigures = new Set(directParents);

        for (const pid of directParents) {
            const pPartners = await getPartners(pid);
            pPartners.forEach(id => { addId(id); allParentFigures.add(id); });
        }

        const parentDataMap = new Map();
        for (const pid of allParentFigures) {
            const gpIds = await getParents(pid);
            gpIds.forEach(addId);
            parentDataMap.set(pid, { grandparents: gpIds });
        }

        let siblingsSet = new Set();
        for (const pid of allParentFigures) {
            const kids = await getChildren(pid);
            kids.forEach(k => { if(k !== targetUser.id) { addId(k); siblingsSet.add(k); } });
        }

        const siblingDataMap = new Map();
        for (const sid of siblingsSet) {
            const nephews = await getChildren(sid);
            nephews.forEach(addId);
            siblingDataMap.set(sid, { nephews: nephews });
        }

        const targetPartners = await getPartners(targetUser.id);
        targetPartners.forEach(addId);

        let allChildren = new Set(await getChildren(targetUser.id));
        for (const pid of targetPartners) {
            const pKids = await getChildren(pid);
            pKids.forEach(k => allChildren.add(k));
        }
        allChildren.forEach(addId);

        const childDataMap = new Map();
        for (const cid of allChildren) {
            const cPartners = await getPartners(cid);
            cPartners.forEach(addId);

            let cKids = new Set(await getChildren(cid));
            for (const cpid of cPartners) {
                const cpKids = await getChildren(cpid);
                cpKids.forEach(k => cKids.add(k));
            }
            cKids.forEach(addId);

            const grandMap = new Map();
            for (const gid of cKids) {
                const gPartners = await getPartners(gid);
                gPartners.forEach(addId);

                let gKids = new Set(await getChildren(gid));
                for(const gpid of gPartners) {
                     const gpKids = await getChildren(gpid);
                     gpKids.forEach(k => gKids.add(k));
                }
                gKids.forEach(addId);
                grandMap.set(gid, { partners: gPartners, offspring: Array.from(gKids) });
            }
            childDataMap.set(cid, { partners: cPartners, offspring: Array.from(cKids), grandMap: grandMap });
        }

        const allIDsArray = Array.from(allInvolvedUserIds);
        let membersMap = new Map(); 

        try {
            const fetchedMembers = await guild.members.fetch({ user: allIDsArray });
            fetchedMembers.forEach(m => membersMap.set(m.id, m));
        } catch (e) {
            allIDsArray.forEach(id => {
                const m = guild.members.cache.get(id);
                if (m) membersMap.set(id, m);
            });
        }

        const prepareUserObj = async (id) => {
            const m = membersMap.get(id);
            if (!m) return null;
            const color = await getUserColor(client, id, guild, db);
            return {
                username: m.user.username,
                id: id,
                color: color,
                avatarURL: m.user.displayAvatarURL({ extension: 'png' })
            };
        };

        const mainUserObj = await prepareUserObj(targetUser.id);
        if (!mainUserObj) return message.reply("❌ تعذر العثور على بيانات المستخدم.");

        let treeData = {
            main: mainUserObj,
            parents: [],
            partners: [],
            children: [],
            siblings: { left: [], right: [] }
        };

        for (const pid of allParentFigures) {
            const u = await prepareUserObj(pid);
            if (u) {
                const pData = parentDataMap.get(pid);
                let gpObjs = [];
                for(const gpId of pData.grandparents) {
                    const gpu = await prepareUserObj(gpId);
                    if(gpu) gpObjs.push(gpu);
                }
                treeData.parents.push({ ...u, grandparents: gpObjs });
            }
        }

        const siblingsArray = Array.from(siblingsSet);
        for (let i = 0; i < siblingsArray.length; i++) {
            const sid = siblingsArray[i];
            const u = await prepareUserObj(sid);
            if (u) {
                const sData = siblingDataMap.get(sid);
                let nephObjs = [];
                for(const nephId of sData.nephews) {
                    const nephU = await prepareUserObj(nephId);
                    if(nephU) nephObjs.push(nephU);
                }
                
                const siblingCompleteObj = { ...u, nephews: nephObjs };

                if (i % 2 === 0) treeData.siblings.left.push(siblingCompleteObj);
                else treeData.siblings.right.push(siblingCompleteObj);
            }
        }

        for (const pid of targetPartners) {
            const u = await prepareUserObj(pid);
            if (u) treeData.partners.push(u);
        }

        for (const cid of allChildren) {
            const childObj = await prepareUserObj(cid);
            if (!childObj) continue;

            const cData = childDataMap.get(cid);
            let cPartnersObjs = [];
            for (const cpid of cData.partners) {
                const u = await prepareUserObj(cpid);
                if (u) cPartnersObjs.push(u);
            }

            let grandObjs = [];
            for (const gid of cData.offspring) {
                const u = await prepareUserObj(gid);
                if (!u) continue;

                const gData = cData.grandMap.get(gid);
                let greatObjs = [];
                for (const greatId of gData.offspring) {
                    const gu = await prepareUserObj(greatId);
                    if (gu) greatObjs.push(gu);
                }
                grandObjs.push({ ...u, offspring: greatObjs });
            }

            treeData.children.push({
                ...childObj,
                partners: cPartnersObjs,
                offspring: grandObjs
            });
        }

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

        message.channel.sendTyping();
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
