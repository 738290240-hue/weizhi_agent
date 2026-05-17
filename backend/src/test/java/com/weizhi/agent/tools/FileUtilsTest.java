package com.weizhi.agent.tools;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

public class FileUtilsTest {

    @Test
    public void testDetectImageExtension() {
        byte[] pngHeader = new byte[]{(byte) 0x89, (byte) 0x50, (byte) 0x4E, (byte) 0x47};
        assertEquals("png", FileUtils.detectImageExtension(pngHeader));

        byte[] jpgHeader = new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
        assertEquals("jpg", FileUtils.detectImageExtension(jpgHeader));

        assertEquals("bin", FileUtils.detectImageExtension(new byte[]{0, 0, 0, 0}));
    }

    @Test
    public void testGenerateUniqueFilename() {
        String filename = FileUtils.generateUniqueFilename("jpg");
        assertTrue(filename.endsWith(".jpg"));
        assertTrue(filename.length() > 36);
    }
}
