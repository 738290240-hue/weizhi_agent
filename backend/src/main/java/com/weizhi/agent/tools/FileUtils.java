package com.weizhi.agent.tools;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;

/**
 * 图片工作台文件操作工具类。
 *
 * <p>封装了图片文件的保存、唯一文件名生成、扩展名提取及路径安全性校验等通用逻辑，
 * 供 Controller 和 Service 层复用。</p>
 *
 * <p><b>设计原则：</b></p>
 * <ul>
 *   <li>所有方法均为 {@code public static} 工具方法，无状态。</li>
 *   <li>不实例化此类（私有构造函数 + 工具类模式）。</li>
 *   <li>路径操作均使用 {@link Path#normalize()} 规范化路径，防止符号链 接类攻击。</li>
 * </ul>
 *
 * @author imageworkbench
 * @description 文件操作的通用工具类
 */
public class FileUtils {
    private static final Logger log = LoggerFactory.getLogger(FileUtils.class);

    /**
     * 私有构造函数，防止实例化。
     *
     * <p>此类所有方法均为 static 工具方法，不需要也不应该创建实例。</p>
     */
    private FileUtils() {
    }

    /**
     * 将二进制内容保存为本地文件。
     *
     * <p>如果目标目录不存在，会自动创建父目录。文件写入使用 {@link Files#write(Path, byte[])}，
     * 覆盖已存在的同名文件。</p>
     *
     * @param content   二进制数据
     * @param filename  目标文件名（不含路径）
     * @param basePath  基础存储路径（文件将保存在此目录下）
     * @return 文件的完整绝对路径字符串
     * @throws IOException 如果目录创建失败或文件写入失败
     */
    public static String saveFile(byte[] content, String filename, String basePath) throws IOException {
        Path directory = Paths.get(basePath).toAbsolutePath();
        if (!Files.exists(directory)) {
            Files.createDirectories(directory);
            log.info("Created directory: {}", directory);
        }

        Path filePath = directory.resolve(filename);
        Files.write(filePath, content);
        log.info("Saved file: {}", filePath);
        return filePath.toString();
    }

    /**
     * 生成基于 UUID 的唯一文件名。
     *
     * <p>使用 {@link UUID#randomUUID()} 生成不含时间戳的随机文件名，
     * 避免文件名冲突和猜测，适用于生成结果的存储。</p>
     *
     * @param originalExt 文件扩展名（可为 null；支持带或不带前导点）
     * @return 形如 {@code "550e8400-e29b-41d4-a716-446655440000.png"}  的文件名
     */
    public static String generateUniqueFilename(String originalExt) {
        String uuid = UUID.randomUUID().toString();
        String ext = originalExt != null && !originalExt.isEmpty()
                ? (originalExt.startsWith(".") ? originalExt : "." + originalExt)
                : "";
        return uuid + ext;
    }

    /**
     * 根据二进制数据的前几个字节（Magic Bytes）识别图片格式并返回建议的扩展名。
     * 支持识别 PNG, JPEG, WebP, GIF。
     *
     * @param data 图片二进制数据
     * @return 建议的扩展名（不带点，如 "png", "jpg"），识别失败返回 "bin"
     */
    public static String detectImageExtension(byte[] data) {
        if (data == null || data.length < 3) return "bin";

        // JPEG: FF D8 FF
        if (data[0] == (byte) 0xFF && data[1] == (byte) 0xD8 && data[2] == (byte) 0xFF) {
            return "jpg";
        }
        // PNG: 89 50 4E 47
        if (data[0] == (byte) 0x89 && data[1] == (byte) 0x50 && data[2] == (byte) 0x4E && data[3] == (byte) 0x47) {
            return "png";
        }
        // GIF: 47 49 46 38
        if (data[0] == (byte) 0x47 && data[1] == (byte) 0x49 && data[2] == (byte) 0x46 && data[3] == (byte) 0x38) {
            return "gif";
        }
        // WebP: RIFF .... WEBP
        if (data[0] == (byte) 0x52 && data[1] == (byte) 0x49 && data[2] == (byte) 0x46 && data[3] == (byte) 0x46) {
            return "webp";
        }

        return "bin";
    }

    /**
     * 获取文件扩展名（不含点，小写返回）。
     *
     * <p>从文件名最后一个点号之后提取扩展名。如果文件无扩展名或以点结尾，返回空字符串。</p>
     *
     * @param filename 文件名（可为 null）
     * @return 扩展名小写（不含点），如 {@code "png"}、{@code "jpg"}；无扩展名返回空字符串
     */
    public static String getFileExtension(String filename) {
        if (filename == null || filename.isEmpty()) {
            return "";
        }
        int lastDot = filename.lastIndexOf('.');
        if (lastDot == -1 || lastDot == filename.length() - 1) {
            return "";
        }
        return filename.substring(lastDot + 1).toLowerCase();
    }

    /**
     * 路径安全性检查。
     *
     * <p>确保解析后的完整路径确实位于基础路径之内，防止通过 {@code ../} 路径穿越访问系统敏感目录。</p>
     *
     * <p>工作原理：先对两个路径都进行 {@link Path#normalize()} 规范化（解析符号链接、移除冗余点号），
     * 然后检查规范化后的路径是否以基础路径为前缀。</p>
     *
     * <p><b>示例：</b></p>
     * <pre>{@code
     * // 合法访问
     * isPathSafe("/data/images/photo.png", "/data/images") → true
     * // 非法访问（路径穿越）
     * isPathSafe("/data/images/../secret.txt", "/data/images") → false
     * }</pre>
     *
     * @param filePath 完整的目标文件路径
     * @param basePath 允许访问的基础路径
     * @return 文件路径在基础路径范围内返回 true，否则返回 false
     */
    public static boolean isPathSafe(String filePath, String basePath) {
        Path resolved = Paths.get(filePath).normalize();
        Path base = Paths.get(basePath).normalize();
        return resolved.startsWith(base);
    }

    /**
     * 判断是否为合法的图片扩展名。
     *
     * <p>支持的文件格式：PNG, JPG/JPEG, WebP, GIF。</p>
     *
     * @param filename 文件名
     * @return 是否为受支持的图片扩展名
     */
    public static boolean isValidImageExtension(String filename) {
        String ext = getFileExtension(filename);
        return ext.equals("png") || ext.equals("jpg") || ext.equals("jpeg") || ext.equals("webp") || ext.equals("gif");
    }
}
