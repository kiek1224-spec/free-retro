// Original GBA test cartridge. No commercial ROM or BIOS content.
#include <gba.h>
#include <stdio.h>
__attribute__((used)) const char rtc_id[] = "SIIRTC_V001";
__attribute__((used)) const char sram_id[] = "FLASH1M_V103";
#define GPIO (*(volatile unsigned short*)0x080000C4)
#define DIRECTION (*(volatile unsigned short*)0x080000C6)
#define CONTROL (*(volatile unsigned short*)0x080000C8)
static void rtc_read(unsigned char out[7]) {
    CONTROL=1; DIRECTION=7; GPIO=1; GPIO=5;
    unsigned command=0xA6;
    for(unsigned bit=0;bit<8;bit++){unsigned value=4|(((command>>bit)&1)<<1);GPIO=value;GPIO=value|1;}
    DIRECTION=5;
    for(unsigned byte=0;byte<7;byte++){
        unsigned value=0;
        for(unsigned bit=0;bit<8;bit++){GPIO=4;GPIO=5;value|=((GPIO>>1)&1)<<bit;}
        out[byte]=value;
    }
    GPIO=1;
}
static void flash_byte(unsigned address, unsigned value) {
    volatile unsigned char* flash=(volatile unsigned char*)0x0E000000;
    flash[0x5555]=0xAA;flash[0x2AAA]=0x55;flash[0x5555]=0xA0;flash[address]=value;
}
int main(void){
    irqInit();irqEnable(IRQ_VBLANK);consoleDemoInit();
    iprintf("%s %s\n",rtc_id,sram_id);
    volatile unsigned char* probe=(volatile unsigned char*)0x0203FF00;
    volatile unsigned char* sram=(volatile unsigned char*)0x0E000000;
    probe[0]='F';probe[1]='R';probe[2]='T';probe[3]='C';
    unsigned frame=0;
    while(1){
        unsigned char date[7];rtc_read(date);
        for(unsigned i=0;i<7;i++) probe[i+4]=date[i];
        flash_byte(0,'F');flash_byte(1,'R');flash_byte(2,'S');flash_byte(3,'M');
        for(unsigned i=0;i<7;i++) flash_byte(i+4,date[i]);
        iprintf("\x1b[0;0HFREE RETRO RTC TEST\n\n20%02x-%02x-%02x\n%02x:%02x:%02x\n\nRTC + SRAM ORIGINAL ROM\nFrames %lu\n",date[0],date[1],date[2],date[4],date[5],date[6],(unsigned long)frame++);
        for(unsigned i=0;i<30;i++) VBlankIntrWait();
    }
}


