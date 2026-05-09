// ========================================
// 栏目管理接口 - 简化版，先测试基本功能
// ========================================

const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // GET请求：获取所有栏目
    if (req.method === 'GET') {
      try {
        const folders = await cloudinary.api.root_folders();
        const jianxiaoyunFolder = folders.folders.find(f => f.name === 'jianxiaoyun');

        if (!jianxiaoyunFolder) {
          return res.status(200).json({ success: true, categories: [] });
        }

        const mainCategories = await cloudinary.api.sub_folders('jianxiaoyun');
        const categoriesWithSubs = await Promise.all(
          mainCategories.folders.map(async (mainCat) => {
            try {
              const subFolders = await cloudinary.api.sub_folders(`jianxiaoyun/${mainCat.name}`);
              return {
                name: mainCat.name,
                subCategories: subFolders.folders.map(sub => sub.name)
              };
            } catch (error) {
              return { name: mainCat.name, subCategories: [] };
            }
          })
        );

        return res.status(200).json({ success: true, categories: categoriesWithSubs });
      } catch (error) {
        return res.status(200).json({ success: true, categories: [] });
      }
    }

    // 其他请求需要密码验证
    const { password, action, categoryName, newCategoryName, subCategoryName, newSubCategoryName } = req.body;

    if (password !== process.env.UPLOAD_PASSWORD) {
      return res.status(403).json({ error: '密码错误，无权限操作' });
    }

    // POST请求：添加栏目
    if (req.method === 'POST') {
      if (action === 'addCategory') {
        if (!categoryName) {
          return res.status(400).json({ error: '请提供栏目名称' });
        }

        const tempFile = 'data:text/plain;base64,dGVtcA==';
        await cloudinary.uploader.upload(tempFile, {
          resource_type: 'raw',
          public_id: `jianxiaoyun/${categoryName}/.placeholder`,
          folder: `jianxiaoyun/${categoryName}`
        });

        return res.status(200).json({
          success: true,
          message: `栏目"${categoryName}"创建成功`
        });
      }

      if (action === 'addSubCategory') {
        if (!categoryName || !subCategoryName) {
          return res.status(400).json({ error: '请提供栏目名称和子栏目名称' });
        }

        const tempFile = 'data:text/plain;base64,dGVtcA==';
        await cloudinary.uploader.upload(tempFile, {
          resource_type: 'raw',
          public_id: `jianxiaoyun/${categoryName}/${subCategoryName}/.placeholder`,
          folder: `jianxiaoyun/${categoryName}/${subCategoryName}`
        });

        return res.status(200).json({
          success: true,
          message: `子栏目"${subCategoryName}"创建成功`
        });
      }
    }

    // DELETE请求：删除栏目
    if (req.method === 'DELETE') {
      if (action === 'deleteCategory') {
        if (!categoryName) {
          return res.status(400).json({ error: '请提供栏目名称' });
        }

        await cloudinary.api.delete_resources_by_prefix(`jianxiaoyun/${categoryName}/`, {
          resource_type: 'raw'
        });
        await cloudinary.api.delete_resources_by_prefix(`jianxiaoyun/${categoryName}/`, {
          resource_type: 'image'
        });
        await cloudinary.api.delete_folder(`jianxiaoyun/${categoryName}`);

        return res.status(200).json({
          success: true,
          message: `栏目"${categoryName}"已删除`
        });
      }

      if (action === 'deleteSubCategory') {
        if (!categoryName || !subCategoryName) {
          return res.status(400).json({ error: '请提供完整的栏目信息' });
        }

        await cloudinary.api.delete_resources_by_prefix(
          `jianxiaoyun/${categoryName}/${subCategoryName}/`,
          { resource_type: 'raw' }
        );
        await cloudinary.api.delete_resources_by_prefix(
          `jianxiaoyun/${categoryName}/${subCategoryName}/`,
          { resource_type: 'image' }
        );
        await cloudinary.api.delete_folder(`jianxiaoyun/${categoryName}/${subCategoryName}`);

        return res.status(200).json({
          success: true,
          message: `子栏目"${subCategoryName}"已删除`
        });
      }
    }

    return res.status(400).json({ error: '无效的请求' });

  } catch (error) {
    console.error('栏目管理失败:', error);
    return res.status(500).json({
      error: '操作失败',
      details: error.message
    });
  }
};
